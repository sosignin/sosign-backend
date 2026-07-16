import mongoose from "mongoose";

const faqSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      required: [true, "Question is required"],
      trim: true,
    },
    answer: {
      type: String,
      required: [true, "Answer is required"],
      trim: true,
    },
    category: {
      type: String,
      default: "general",
      trim: true,
      lowercase: true,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

faqSchema.index({ category: 1 });
faqSchema.index({ order: 1 });

// Static method to seed default FAQs
faqSchema.statics.seedDefaults = async function () {
  const defaultFaqs = [
    {
      question: "What is SoSign?",
      answer: "SoSign is India's leading digital platform for verified petitions and crowdfunding. We empower citizens, social workers, and organizations to start social movements, gather verified signatures via Aadhaar, and raise funds for public interest campaigns.",
      category: "general",
      order: 1
    },
    {
      question: "How does signature verification work on SoSign?",
      answer: "Unlike traditional platforms, SoSign integrates secure identity verification (such as Aadhaar, PAN, or Voter ID checks) to ensure that every signature represents a unique, verified citizen. This prevents spam signatures and significantly increases the credibility of petitions when submitted to government bodies or decision-makers.",
      category: "verification",
      order: 2
    },
    {
      question: "Is it free to start a petition?",
      answer: "Yes, starting a petition on SoSign is completely free for everyone. You can easily write your petition, add supporting images/documents, and publish it to start gathering signatures right away.",
      category: "petitions",
      order: 3
    },
    {
      question: "How do I launch a crowdfunding campaign?",
      answer: "If your petition or cause requires financial support (for healthcare, education, community relief, etc.), you can launch a crowdfunding campaign directly alongside your petition. Simply select the crowdfunding option in your dashboard, describe your fundraiser, and securely receive donations from supporters.",
      category: "crowdfunding",
      order: 4
    },
    {
      question: "How does Aadhaar KYC verify signatures safely?",
      answer: "Aadhaar KYC checks are performed securely through authorized, government-approved partner gateways. We verify the identity of the signer but never store sensitive details like Aadhaar numbers on our servers, ensuring absolute privacy and data security.",
      category: "verification",
      order: 5
    },
    {
      question: "Can I edit my petition after it is published?",
      answer: "You can edit non-critical details like description, goals, and images to keep your campaign updated. However, you cannot change the core title or main objective of the petition once signatures have started gathering, as that would be unfair to existing signers.",
      category: "petitions",
      order: 6
    },
    {
      question: "What happens when my petition reaches its signature goal?",
      answer: "Once your petition achieves its goal, we help you package and deliver the verified signatures, comments, and petition details to the designated decision-makers (such as ministers, commissioners, or local administrators) to initiate action.",
      category: "general",
      order: 7
    },
    {
      question: "Are donations to crowdfunding campaigns safe?",
      answer: "Yes, all donations are processed through leading, PCI-DSS compliant secure payment gateways. Funds are held securely and disbursed to the verified bank account of the campaign starter or beneficiary once verification checks are complete.",
      category: "crowdfunding",
      order: 8
    }
  ];

  for (const faq of defaultFaqs) {
    try {
      await this.findOneAndUpdate(
        { question: faq.question },
        faq,
        { upsert: true, new: true }
      );
    } catch (error) {
      console.error(`Error seeding FAQ "${faq.question}":`, error.message);
    }
  }

  console.log("✅ Default FAQs seeded successfully");
};

const Faq = mongoose.model("Faq", faqSchema);

export default Faq;
