import mongoose from "mongoose";

const planSchema = mongoose.Schema(
    {
        key: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        price: {
            type: Number,
            required: true,
            min: 0,
        },
        points: {
            type: Number,
            required: true,
            min: 0,
        },
        bestFor: {
            type: String,
            default: "",
        },
        deductions: {
            aadhaar: {
                type: Number,
                required: true,
                min: 0,
            },
            pan: {
                type: Number,
                required: true,
                min: 0,
            },
            voter: {
                type: Number,
                required: true,
                min: 0,
            },
            aadhaar_pan: {
                type: Number,
                required: true,
                min: 0,
            },
            aadhaar_voter: {
                type: Number,
                required: true,
                min: 0,
            },
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
    }
);

// Method to seed defaults
planSchema.statics.seedDefaults = async function () {
    const count = await this.countDocuments();
    if (count === 0) {
        console.log("🌱 Seeding default plan packages...");
        const defaultPlans = [
            {
                key: "free",
                name: "Free Plan",
                price: 0,
                points: 0,
                bestFor: "Trial for new users",
                deductions: {
                    aadhaar: 0,
                    pan: 0,
                    voter: 0,
                    aadhaar_pan: 0,
                    aadhaar_voter: 0,
                },
                isActive: true,
            },
            {
                key: "bronze",
                name: "Bronze Plan",
                price: 999,
                points: 200,
                bestFor: "Individuals & Startups",
                deductions: {
                    aadhaar: 8,
                    pan: 5,
                    voter: 5,
                    aadhaar_pan: 10,
                    aadhaar_voter: 10,
                },
                isActive: true,
            },
            {
                key: "silver",
                name: "Silver Plan",
                price: 49000,
                points: 9800,
                bestFor: "Growing Businesses",
                deductions: {
                    aadhaar: 5,
                    pan: 4,
                    voter: 4,
                    aadhaar_pan: 7,
                    aadhaar_voter: 7,
                },
                isActive: true,
            },
            {
                key: "gold",
                name: "Gold Plan",
                price: 99000,
                points: 19800,
                bestFor: "High-Volume Businesses",
                deductions: {
                    aadhaar: 3,
                    pan: 3,
                    voter: 3,
                    aadhaar_pan: 5,
                    aadhaar_voter: 5,
                },
                isActive: true,
            },
            {
                key: "platinum",
                name: "Platinum Plan",
                price: 499999,
                points: 100000,
                bestFor: "Enterprise Organizations",
                deductions: {
                    aadhaar: 2.5,
                    pan: 2,
                    voter: 2,
                    aadhaar_pan: 4,
                    aadhaar_voter: 4,
                },
                isActive: true,
            },
        ];
        await this.create(defaultPlans);
        console.log("🚀 Default plan packages seeded successfully!");
    }
};

const Plan = mongoose.model("Plan", planSchema);

export default Plan;
