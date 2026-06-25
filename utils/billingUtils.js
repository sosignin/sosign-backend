import Plan from "../models/planModel.js";

/**
 * Dynamically resolves the qualified plan tier key from the payment amount.
 * Sorts active plans by price descending and matches the highest qualified tier.
 * 
 * @param {Number} amount 
 * @returns {Promise<String>} plan key (e.g. 'bronze', 'silver', etc.)
 */
export const getTierFromAmount = async (amount) => {
  try {
    const plans = await Plan.find({ isActive: true, price: { $gt: 0 } }).sort({ price: -1 });
    for (const plan of plans) {
      if (amount >= plan.price) {
        return plan.key;
      }
    }
  } catch (error) {
    console.error("Error in getTierFromAmount:", error);
  }
  return "free";
};

/**
 * Dynamically resolves points to credit based on the payment amount.
 * Matches exact plan pricing config, or falls back to ₹5 = 1 Point.
 * 
 * @param {Number} amount 
 * @returns {Promise<Number>} points to award
 */
export const getPointsFromAmount = async (amount) => {
  try {
    const plans = await Plan.find({ isActive: true });
    const exactPlan = plans.find((p) => p.price === amount);
    if (exactPlan) {
      return exactPlan.points;
    }
  } catch (error) {
    console.error("Error in getPointsFromAmount:", error);
  }
  // Fallback conversion: 1 point = ₹5
  return Math.floor(amount / 5);
};

/**
 * Dynamically calculates points deduction cost for a verification check.
 * Handles free check counters, plan rates, and combined verification discounts.
 * 
 * @param {Object} user User document
 * @param {String} type Verification type ('aadhaar', 'pan', 'voter')
 * @returns {Promise<Number>} Point cost, or -1 if verification is blocked
 */
export const calculateVerificationCost = async (user, type) => {
  // If user has free checks remaining, cost is 0.
  if (user.freeChecksRemaining > 0) {
    return 0;
  }

  const planKey = user.plan || "free";
  // If the user has exhausted free checks and is still on the free plan, they cannot verify.
  if (planKey === "free" || planKey === "none") {
    return -1;
  }

  try {
    const plan = await Plan.findOne({ key: planKey });
    if (!plan || !plan.deductions) {
      return -1;
    }

    const rates = plan.deductions;

    const isAadhaarVerified = user.aadhaarKyc?.status === "verified";
    const isPanVerified = user.panKyc?.status === "verified";
    const isVoterVerified = user.voterKyc?.status === "verified";

    if (type === "aadhaar") {
      if (isAadhaarVerified) return 0;
      // Apply combined verification discount if PAN or Voter is already verified
      if (isPanVerified && rates.aadhaar_pan !== undefined && rates.pan !== undefined) {
        return rates.aadhaar_pan - rates.pan;
      }
      if (isVoterVerified && rates.aadhaar_voter !== undefined && rates.voter !== undefined) {
        return rates.aadhaar_voter - rates.voter;
      }
      return rates.aadhaar;
    }

    if (type === "pan") {
      if (isPanVerified) return 0;
      // Apply combined verification discount if Aadhaar is already verified
      if (isAadhaarVerified && rates.aadhaar_pan !== undefined && rates.aadhaar !== undefined) {
        return rates.aadhaar_pan - rates.aadhaar;
      }
      return rates.pan;
    }

    if (type === "voter") {
      if (isVoterVerified) return 0;
      // Apply combined verification discount if Aadhaar is already verified
      if (isAadhaarVerified && rates.aadhaar_voter !== undefined && rates.aadhaar !== undefined) {
        return rates.aadhaar_voter - rates.aadhaar;
      }
      return rates.voter;
    }
  } catch (error) {
    console.error("Error in calculateVerificationCost:", error);
  }

  return -1;
};
