const mongoose = require("mongoose");

const homeSchema = mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  houseName: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  location: {
    type: String,
    required: true,
  },
  rating: {
    type: Number,
    default: 0,
  },
  ratingCount: {
    type: Number,
    default: 0,
  },
  photo: String, // Keep for backward compatibility
  photos: [String], // Array of photo paths for multiple photos
  description: String,
  furnished: {
    type: String,
    enum: ['Unfurnished', 'Semi Furnished', 'Fully Furnished'],
    default: 'Unfurnished',
  },
  bhk: {
    type: String,
    enum: ['1 BHK', '2 BHK', '3 BHK'],
  },
  feedbackSummary: {
    type: String,
  },
  keywords: {
    type: [String],
    default: [],
  },
});

// homeSchema.pre('findOneAndDelete', async function(next) {
//   console.log('Came to pre hook while deleting a home');
//   const homeId = this.getQuery()._id;
//   await favourite.deleteMany({houseId: homeId});
//   next();
// });

module.exports = mongoose.model("Home", homeSchema);
