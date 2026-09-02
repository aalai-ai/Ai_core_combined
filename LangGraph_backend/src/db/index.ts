import mongoose from "mongoose";
import { config } from "../config";

export async function connectDB() {
  try {
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 2000 });
    console.log("✅ MongoDB connected");
  } catch (err: any) {
    console.warn(`⚠️ MongoDB connection warning (${err.message}). Agent running in memory/ephemeral state mode.`);
  }
}