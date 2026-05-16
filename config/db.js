import mongoose from "mongoose";

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URL);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    
    // Ensure unique index on mobileNumber is removed to allow dummy accounts with duplicate mobiles
    try {
      await mongoose.connection.collection('users').dropIndex('mobileNumber_1');
      console.log('Successfully dropped unique index on mobileNumber');
    } catch (indexError) {
      // Index might not exist or already be dropped, ignore this error
      if (indexError.code !== 27) { // 27 is IndexNotFound
        console.log('Note: mobileNumber unique index not found or already removed');
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;
