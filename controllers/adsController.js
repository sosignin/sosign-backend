import asyncHandler from "express-async-handler";
import Ad from "../models/adsModel.js";

// @desc    Get all ads (admin)
// @route   GET /api/ads
// @access  Public/Admin
// @desc    Get all ads (admin)
// @route   GET /api/ads
// @access  Public/Admin
const getAds = asyncHandler(async (req, res) => {
    const { position, active } = req.query;

    let query = {};

    if (position) {
        query.position = position;
    }

    if (active !== undefined) {
        query.isActive = active === "true";
    }

    const ads = await Ad.find(query).sort({ priority: -1, createdAt: -1 });

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const formattedAds = ads.map((ad) => {
        const adObj = ad.toObject();
        if (adObj.image && !adObj.image.startsWith("http://") && !adObj.image.startsWith("https://")) {
            const cleanPath = adObj.image.replace(/\\/g, "/").replace(/^\//, "");
            adObj.image = `${baseUrl}/${cleanPath}`;
        }
        return adObj;
    });

    res.json({
        success: true,
        count: formattedAds.length,
        ads: formattedAds,
    });
});

// @desc    Get active ads for public display
// @route   GET /api/ads/active
// @access  Public
const getActiveAds = asyncHandler(async (req, res) => {
    const { position } = req.query;

    const now = new Date();

    let query = {
        isActive: true,
    };

    if (position) {
        query.position = position;
    }

    const allAds = await Ad.find(query).sort({ priority: -1, createdAt: -1 });

    // Filter by dates safely in JavaScript
    const validAds = allAds.filter((ad) => {
        if (ad.startDate && new Date(ad.startDate) > now) {
            return false;
        }
        if (ad.endDate && new Date(ad.endDate) < now) {
            return false;
        }
        return true;
    });

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const formattedAds = validAds.map((ad) => {
        const adObj = ad.toObject();
        if (adObj.image && !adObj.image.startsWith("http://") && !adObj.image.startsWith("https://")) {
            const cleanPath = adObj.image.replace(/\\/g, "/").replace(/^\//, "");
            adObj.image = `${baseUrl}/${cleanPath}`;
        }
        return adObj;
    });

    // Increment impressions
    if (validAds.length > 0) {
        Ad.updateMany(
            { _id: { $in: validAds.map((ad) => ad._id) } },
            { $inc: { impressions: 1 } }
        ).catch((e) => console.error("Ad impression update error:", e));
    }

    res.json({
        success: true,
        count: formattedAds.length,
        ads: formattedAds,
    });
});

// @desc    Get single ad by ID
// @route   GET /api/ads/:id
// @access  Public/Admin
const getAdById = asyncHandler(async (req, res) => {
    const ad = await Ad.findById(req.params.id);

    if (!ad) {
        res.status(404);
        throw new Error("Ad not found");
    }

    res.json({
        success: true,
        ad,
    });
});

// @desc    Create new ad
// @route   POST /api/ads
// @access  Admin
const createAd = asyncHandler(async (req, res) => {
    const { title, description, link, position, priority, startDate, endDate } = req.body;

    if (!req.file) {
        res.status(400);
        throw new Error("Ad image is required");
    }

    const ad = await Ad.create({
        title,
        description,
        image: req.file.path,
        link,
        position: position || "sidebar",
        priority: priority || 0,
        startDate: startDate || new Date(),
        endDate: endDate || null,
    });

    res.status(201).json({
        success: true,
        message: "Ad created successfully",
        ad,
    });
});

// @desc    Update ad
// @route   PUT /api/ads/:id
// @access  Admin
const updateAd = asyncHandler(async (req, res) => {
    const ad = await Ad.findById(req.params.id);

    if (!ad) {
        res.status(404);
        throw new Error("Ad not found");
    }

    const { title, description, link, position, priority, isActive, startDate, endDate } = req.body;

    ad.title = title || ad.title;
    ad.description = description !== undefined ? description : ad.description;
    ad.link = link || ad.link;
    ad.position = position || ad.position;
    ad.priority = priority !== undefined ? priority : ad.priority;
    ad.isActive = isActive !== undefined ? isActive : ad.isActive;
    ad.startDate = startDate || ad.startDate;
    ad.endDate = endDate !== undefined ? endDate : ad.endDate;

    // Update image if new one is uploaded
    if (req.file) {
        ad.image = req.file.path;
    }

    const updatedAd = await ad.save();

    res.json({
        success: true,
        message: "Ad updated successfully",
        ad: updatedAd,
    });
});

// @desc    Delete ad
// @route   DELETE /api/ads/:id
// @access  Admin
const deleteAd = asyncHandler(async (req, res) => {
    const ad = await Ad.findById(req.params.id);

    if (!ad) {
        res.status(404);
        throw new Error("Ad not found");
    }

    await Ad.findByIdAndDelete(req.params.id);

    res.json({
        success: true,
        message: "Ad deleted successfully",
    });
});

// @desc    Toggle ad status
// @route   PUT /api/ads/:id/toggle
// @access  Admin
const toggleAdStatus = asyncHandler(async (req, res) => {
    const ad = await Ad.findById(req.params.id);

    if (!ad) {
        res.status(404);
        throw new Error("Ad not found");
    }

    ad.isActive = !ad.isActive;
    await ad.save();

    res.json({
        success: true,
        message: `Ad ${ad.isActive ? "activated" : "deactivated"} successfully`,
        ad,
    });
});

// @desc    Track ad click
// @route   POST /api/ads/:id/click
// @access  Public
const trackAdClick = asyncHandler(async (req, res) => {
    const ad = await Ad.findById(req.params.id);

    if (!ad) {
        res.status(404);
        throw new Error("Ad not found");
    }

    ad.clicks += 1;
    await ad.save();

    res.json({
        success: true,
        message: "Click tracked",
        redirectUrl: ad.link,
    });
});

// @desc    Get ads statistics
// @route   GET /api/ads/stats
// @access  Admin
const getAdsStats = asyncHandler(async (req, res) => {
    const totalAds = await Ad.countDocuments();
    const activeAds = await Ad.countDocuments({ isActive: true });
    const totalClicks = await Ad.aggregate([
        { $group: { _id: null, total: { $sum: "$clicks" } } },
    ]);
    const totalImpressions = await Ad.aggregate([
        { $group: { _id: null, total: { $sum: "$impressions" } } },
    ]);

    const adsByPosition = await Ad.aggregate([
        { $group: { _id: "$position", count: { $sum: 1 } } },
    ]);

    res.json({
        success: true,
        stats: {
            totalAds,
            activeAds,
            inactiveAds: totalAds - activeAds,
            totalClicks: totalClicks[0]?.total || 0,
            totalImpressions: totalImpressions[0]?.total || 0,
            adsByPosition: adsByPosition.reduce((acc, item) => {
                acc[item._id] = item.count;
                return acc;
            }, {}),
        },
    });
});

export {
    getAds,
    getActiveAds,
    getAdById,
    createAd,
    updateAd,
    deleteAd,
    toggleAdStatus,
    trackAdClick,
    getAdsStats,
};
