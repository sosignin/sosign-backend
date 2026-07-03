import mongoose from "mongoose";

const transactionSchema = mongoose.Schema({
    type: {
        type: String,
        enum: ["credit", "debit"],
        required: true,
    },
    amount: {
        type: Number,
        required: true,
        min: 0,
    },
    description: {
        type: String,
        default: "",
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

const walletSchema = mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
        },
        balance: {
            type: Number,
            default: 0,
            min: 0,
        },
        transactions: [transactionSchema],
    },
    {
        timestamps: true,
    }
);

// Create or get wallet for a user
walletSchema.statics.getOrCreateWallet = async function (userId) {
    let wallet = await this.findOne({ userId });
    const User = mongoose.model("User");
    const user = await User.findById(userId);
    const planKey = user?.plan || "free";

    if (!wallet) {
        let initialBalance = 0;
        let initialTransactions = [];

        if (planKey === "free" || planKey === "none") {
            initialBalance = 20;
            initialTransactions = [
                {
                    type: "credit",
                    amount: 20,
                    description: "Free Plan Welcome Bonus (20 Points)",
                },
            ];
        }

        wallet = await this.create({
            userId,
            balance: initialBalance,
            transactions: initialTransactions,
        });
    } else if (wallet.balance === 0 && wallet.transactions.length === 0) {
        if (planKey === "free" || planKey === "none") {
            wallet.balance = 20;
            wallet.transactions.push({
                type: "credit",
                amount: 20,
                description: "Free Plan Welcome Bonus (20 Points)",
            });
            await wallet.save();
        }
    }
    return wallet;
};

const Wallet = mongoose.model("Wallet", walletSchema);

export default Wallet;
