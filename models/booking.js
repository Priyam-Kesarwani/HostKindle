const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    home: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Home",
      required: true,
    },
    startDate: {
      type: Date,
      default: () => new Date(),
    },
    endDate: {
      type: Date,
      default: () => {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        return d;
      },
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled"],
      default: "confirmed",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Booking", bookingSchema);

