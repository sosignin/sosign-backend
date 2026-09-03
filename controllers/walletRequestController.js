import WalletRequest from "../models/walletRequestModel.js";
import Wallet from "../models/walletModel.js";
import User from "../models/userModel.js";
import { getPointsFromAmount, getTierFromAmount } from "../utils/billingUtils.js";
import createAdminNotification from "../utils/adminNotifier.js";

// Create a new wallet recharge request
export const createWalletRequest = async (req, res) => {
    try {
        const { amount } = req.body;
        const userId = req.user.id;

        if (!amount || amount <= 0) {
            return res.status(400).json({ message: "Invalid amount" });
        }

        const points = await getPointsFromAmount(amount);
        const referenceId = `WLT-${userId}-${Date.now()}`;

        const newRequest = await WalletRequest.create({
            userId,
            amount,
            points,
            referenceId,
            status: "pending",
        });

        // Generate UPI link
        // Format: upi://pay?pa=yourupi@bank&pn=YourWebsite&am={amount}&tn={referenceId}
        const upiId = process.env.UPI_ID || "yourupi@bank";
        const appName = "SOS-Sign";
        const upiLink = `upi://pay?pa=${upiId}&pn=${appName}&am=${amount}&tn=${referenceId}`;

        res.status(201).json({
            message: "Wallet request created successfully",
            request: newRequest,
            upiLink,
        });
    } catch (error) {
        console.error("Error creating wallet request:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Upload payment proof (screenshot)
export const uploadProof = async (req, res) => {
    try {
        const { requestId } = req.params;
        const screenshot = req.file?.path; // Assuming Cloudinary middleware sets req.file.path

        if (!screenshot) {
            return res.status(400).json({ message: "Screenshot is required" });
        }

        const request = await WalletRequest.findById(requestId);
        if (!request) {
            return res.status(404).json({ message: "Wallet request not found" });
        }

        if (request.userId.toString() !== req.user.id && req.user.role !== "admin") {
            return res.status(403).json({ message: "Unauthorized" });
        }

        request.screenshot = screenshot;
        request.status = "verification_pending";
        await request.save();

        // Trigger Admin Notification
        createAdminNotification({
            category: "wallet_request",
            title: "New Wallet Recharge Proof",
            message: `User ${req.user?.name || "User"} uploaded payment proof for ₹${request.amount} (${request.points} points, ref: ${request.referenceId})`,
            link: "/dashboard/wallet-requests",
            relatedId: request._id,
            meta: {
                amount: request.amount,
                points: request.points,
                referenceId: request.referenceId,
                userName: req.user?.name,
            },
        });

        res.status(200).json({
            message: "Proof uploaded successfully. Administration will verify soon.",
            request,
        });
    } catch (error) {
        console.error("Error uploading proof:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Admin: Get all wallet requests
export const getAllWalletRequests = async (req, res) => {
    try {
        const { status } = req.query;
        const filter = status ? { status } : {};

        const requests = await WalletRequest.find(filter)
            .populate("userId", "name email")
            .sort({ createdAt: -1 });

        res.status(200).json({ requests });
    } catch (error) {
        console.error("Error fetching wallet requests:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Admin: Approve wallet request
export const approveWalletRequest = async (req, res) => {
    try {
        const { requestId } = req.params;
        const adminId = req.admin?.email || req.admin?.userId || "Admin"; // Correctly get admin info from req.admin

        const request = await WalletRequest.findById(requestId);
        if (!request) {
            return res.status(404).json({ message: "Wallet request not found" });
        }

        if (request.status === "approved") {
            return res.status(400).json({ message: "Request already approved" });
        }

        // Atomic update to user wallet balance
        const wallet = await Wallet.getOrCreateWallet(request.userId);

        wallet.balance += request.points;
        wallet.transactions.push({
            type: "credit",
            amount: request.points,
            description: `Wallet recharge (Ref: ${request.referenceId})`,
        });

        await wallet.save();

        // Update user plan tier if applicable
        const user = await User.findById(request.userId);
        if (user) {
            const newTier = await getTierFromAmount(request.amount);
            if (newTier !== "free") {
                user.plan = newTier;
                await user.save();
            }
        }

        // Update request status
        request.status = "approved";
        request.approvedBy = adminId;
        await request.save();

        res.status(200).json({ message: "Wallet request approved and balance updated" });
    } catch (error) {
        console.error("Error approving wallet request:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Admin: Reject wallet request
export const rejectWalletRequest = async (req, res) => {
    try {
        const { requestId } = req.params;

        const request = await WalletRequest.findById(requestId);
        if (!request) {
            return res.status(404).json({ message: "Wallet request not found" });
        }

        if (request.status === "approved") {
            return res.status(400).json({ message: "Cannot reject an already approved request" });
        }

        request.status = "rejected";
        await request.save();

        res.status(200).json({ message: "Wallet request rejected" });
    } catch (error) {
        console.error("Error rejecting wallet request:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// User: Get my wallet requests
export const getMyWalletRequests = async (req, res) => {
    try {
        const requests = await WalletRequest.find({ userId: req.user.id }).sort({ createdAt: -1 });
        res.status(200).json({ requests });
    } catch (error) {
        console.error("Error fetching my wallet requests:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
