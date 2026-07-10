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
        mrpPrice: {
            type: Number,
            default: 0,
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
        isCustom: {
            type: Boolean,
            default: false,
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
            sms_dm: {
                type: Number,
                required: true,
                min: 0,
                default: 1.25,
            },
            email_dm: {
                type: Number,
                required: true,
                min: 0,
                default: 0.50,
            },
            whatsapp_dm: {
                type: Number,
                required: true,
                min: 0,
                default: 1.50,
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
                mrpPrice: 0,
                points: 20,
                bestFor: "Trial for new users",
                isCustom: false,
                deductions: {
                    aadhaar: 8,
                    pan: 5,
                    voter: 5,
                    aadhaar_pan: 10,
                    aadhaar_voter: 10,
                    sms_dm: 1.25,
                    email_dm: 0.50,
                    whatsapp_dm: 1.50,
                },
                isActive: true,
            },
            {
                key: "bronze",
                name: "Bronze Plan",
                price: 999,
                mrpPrice: 1999,
                points: 200,
                bestFor: "Individuals & Startups",
                isCustom: false,
                deductions: {
                    aadhaar: 8,
                    pan: 5,
                    voter: 5,
                    aadhaar_pan: 10,
                    aadhaar_voter: 10,
                    sms_dm: 1.25,
                    email_dm: 0.50,
                    whatsapp_dm: 1.50,
                },
                isActive: true,
            },
            {
                key: "silver",
                name: "Silver Plan",
                price: 49999,
                mrpPrice: 49999,
                points: 11111,
                bestFor: "Growing Businesses",
                isCustom: false,
                deductions: {
                    aadhaar: 8,
                    pan: 5,
                    voter: 5,
                    aadhaar_pan: 10,
                    aadhaar_voter: 10,
                    sms_dm: 1.25,
                    email_dm: 0.50,
                    whatsapp_dm: 1.50,
                },
                isActive: true,
            },
            {
                key: "gold",
                name: "Gold Plan",
                price: 99999,
                mrpPrice: 99999,
                points: 25000,
                bestFor: "High-Volume Businesses",
                isCustom: false,
                deductions: {
                    aadhaar: 8,
                    pan: 5,
                    voter: 5,
                    aadhaar_pan: 10,
                    aadhaar_voter: 10,
                    sms_dm: 1.25,
                    email_dm: 0.50,
                    whatsapp_dm: 1.50,
                },
                isActive: true,
            },
            {
                key: "platinum",
                name: "Platinum Plan",
                price: 499999,
                mrpPrice: 499999,
                points: 100000,
                bestFor: "Enterprise Organizations",
                isCustom: true,
                deductions: {
                    aadhaar: 8,
                    pan: 5,
                    voter: 5,
                    aadhaar_pan: 10,
                    aadhaar_voter: 10,
                    sms_dm: 1.25,
                    email_dm: 0.50,
                    whatsapp_dm: 1.50,
                },
                isActive: true,
            },
        ];
        await this.create(defaultPlans);
        console.log("🚀 Default plan packages seeded successfully!");
    } else {
        // Backfill new fields for existing plans
        console.log("🔄 Checking and backfilling new plan fields...");
        const plans = await this.find({});
        for (const plan of plans) {
            let updated = false;
            if (!plan.deductions) plan.deductions = {};
            
            // Force all plans to have uniform point deductions
            const standardDeductions = {
                aadhaar: 8,
                pan: 5,
                voter: 5,
                aadhaar_pan: 10,
                aadhaar_voter: 10,
                sms_dm: 1.25,
                email_dm: 0.50,
                whatsapp_dm: 1.50,
            };

            for (const key of Object.keys(standardDeductions)) {
                if (plan.deductions[key] !== standardDeductions[key]) {
                    plan.deductions[key] = standardDeductions[key];
                    updated = true;
                }
            }

            if (plan.key === "free") {
                if (plan.points !== 20) {
                    plan.points = 20;
                    updated = true;
                }
            }
            if (plan.key === "bronze") {
                if (plan.price !== 999) {
                    plan.price = 999;
                    updated = true;
                }
                if (plan.points !== 200) {
                    plan.points = 200;
                    updated = true;
                }
            }
            if (plan.key === "silver") {
                if (plan.price !== 49999) {
                    plan.price = 49999;
                    updated = true;
                }
                if (plan.mrpPrice !== 49999) {
                    plan.mrpPrice = 49999;
                    updated = true;
                }
                if (plan.points !== 11111) {
                    plan.points = 11111;
                    updated = true;
                }
            }
            if (plan.key === "gold") {
                if (plan.price !== 99999) {
                    plan.price = 99999;
                    updated = true;
                }
                if (plan.mrpPrice !== 99999) {
                    plan.mrpPrice = 99999;
                    updated = true;
                }
                if (plan.points !== 25000) {
                    plan.points = 25000;
                    updated = true;
                }
            }
            if (plan.key === "platinum") {
                if (!plan.isCustom) {
                    plan.isCustom = true;
                    updated = true;
                }
            }
            if (plan.isCustom === undefined) {
                plan.isCustom = plan.key === "platinum" ? true : false;
                updated = true;
            }
            if (plan.mrpPrice === undefined) {
                plan.mrpPrice = plan.key === "bronze" ? 1999 : plan.price;
                updated = true;
            }
            if (plan.key === "bronze" && plan.mrpPrice !== 1999) {
                plan.mrpPrice = 1999;
                updated = true;
            }

            if (updated) {
                plan.markModified("deductions");
                await plan.save();
                console.log(`Updated plan parameters for: ${plan.key}`);
            }
        }
    }
};

const Plan = mongoose.model("Plan", planSchema);

export default Plan;
