import Visitor from "../models/visitorModel.js";
import Traffic from "../models/trafficModel.js";

// @desc    Track site visit / pageview
// @route   POST /api/traffic/visit
// @access  Public
export const recordVisit = async (req, res) => {
  try {
    const rawIp =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      req.ip ||
      "127.0.0.1";

    const ip = rawIp.replace(/^.*:/, ""); // clean IPv6 prefix if present
    const path = req.body?.path || "/";
    const userAgent = req.headers["user-agent"] || "";

    const todayDate = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    // 1. Record or update visitor for today
    await Visitor.findOneAndUpdate(
      { ip, date: todayDate },
      {
        $inc: { pageViews: 1 },
        $set: { lastPath: path, userAgent },
      },
      { upsert: true, new: true }
    );

    // 2. Increment global pageviews counter
    await Traffic.findOneAndUpdate(
      { key: "global_traffic" },
      { $inc: { totalPageViews: 1 } },
      { upsert: true, new: true }
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error recording visit:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get website traffic statistics
// @route   GET /api/traffic/stats
// @access  Public / Admin
export const getTrafficStats = async (req, res) => {
  try {
    const todayDate = new Date().toISOString().split("T")[0];
    const currentMonthPrefix = todayDate.substring(0, 7); // YYYY-MM

    // 1. Total Pageviews
    const trafficDoc = await Traffic.findOne({ key: "global_traffic" });
    const totalPageViews = trafficDoc?.totalPageViews || 0;

    // 2. Today's Unique Visitors
    const todayUniqueVisitors = await Visitor.countDocuments({ date: todayDate });

    // 3. Today's Pageviews
    const todayPageViewsResult = await Visitor.aggregate([
      { $match: { date: todayDate } },
      { $group: { _id: null, count: { $sum: "$pageViews" } } },
    ]);
    const todayPageViews = todayPageViewsResult[0]?.count || 0;

    // 4. This Month's Unique Visitors
    const monthVisitorsResult = await Visitor.aggregate([
      { $match: { date: { $regex: `^${currentMonthPrefix}` } } },
      { $group: { _id: "$ip" } },
      { $count: { total: 1 } },
    ]);
    const monthUniqueVisitors = monthVisitorsResult[0]?.total || 0;

    // 5. Total All-time Unique Visitors (Distinct IPs)
    const totalUniqueIpsResult = await Visitor.aggregate([
      { $group: { _id: "$ip" } },
      { $count: { total: 1 } },
    ]);
    const totalUniqueVisitors = totalUniqueIpsResult[0]?.total || 0;

    res.status(200).json({
      success: true,
      traffic: {
        totalPageViews,
        todayUniqueVisitors,
        todayPageViews,
        monthUniqueVisitors,
        totalUniqueVisitors,
      },
    });
  } catch (error) {
    console.error("Error fetching traffic stats:", error);
    res.status(500).json({ message: error.message });
  }
};
