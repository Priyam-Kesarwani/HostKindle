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
  address: {
    buildingNo: { type: String, default: "" },
    street: { type: String, default: "" },
    locality: { type: String, default: "" },
    landmark: { type: String, default: "" },
    city: { type: String, default: "" },
    state: { type: String, default: "" },
  },
  coordinates: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number], // [lng, lat]
      default: undefined,
    },
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
  phoneNumber: {
    type: String,
    default: "",
  },
  totalFloors: {
    type: Number,
    min: 1,
    default: 1,
  },
  facingDirection: {
    type: String,
    enum: ['East', 'West', 'North', 'South', 'North-East', 'North-West', 'South-East', 'South-West'],
    default: 'East',
  },
  propertyAge: {
    type: String,
    enum: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10+'],
    default: '1',
  },
  propertyType: {
    type: String,
    enum: ['Apartment', 'Independent house', 'Villa', 'Studio', 'PG / Shared Accommodation', 'Hostel'],
    default: 'Apartment',
  },
});

homeSchema.index({ coordinates: "2dsphere" });

// homeSchema.pre('findOneAndDelete', async function(next) {
//   console.log('Came to pre hook while deleting a home');
//   const homeId = this.getQuery()._id;
//   await favourite.deleteMany({houseId: homeId});
//   next();
// });

module.exports = mongoose.model("Home", homeSchema);
