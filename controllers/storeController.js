const Home = require("../models/home");
const User = require("../models/user");
const Comment = require("../models/comment");
const Rating = require("../models/rating");
const Booking = require("../models/booking");
const mongoose = require('mongoose');
const crypto = require("crypto");
const Razorpay = require("razorpay");
const { summarizeComments } = require("../utils/gemini");

const normalizeDateRange = (startDateInput, monthsInput, endDateInput) => {
  const parsedStartDate = startDateInput ? new Date(startDateInput) : new Date();
  const startDate = Number.isNaN(parsedStartDate.getTime()) ? new Date() : parsedStartDate;
  startDate.setHours(0, 0, 0, 0);

  let endDate = null;
  let months = Number.parseInt(monthsInput, 10);

  if (endDateInput) {
    endDate = new Date(endDateInput);
    endDate.setHours(23, 59, 59, 999);
    const monthDiff =
      (endDate.getFullYear() - startDate.getFullYear()) * 12 +
      (endDate.getMonth() - startDate.getMonth());
    months = Math.max(1, monthDiff + 1);
  } else {
    if (!Number.isInteger(months) || months < 1) months = 1;
    endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + months);
    endDate.setHours(23, 59, 59, 999);
  }

  return { startDate, endDate, months };
};

const buildAvailabilityQuery = (startDate, endDate) => ({
  startDate: { $lt: endDate },
  endDate: { $gt: startDate },
  status: { $in: ["pending", "confirmed"] },
});

const getUnavailableHomeIds = async (startDate, endDate) => {
  const overlappingBookings = await Booking.find(
    buildAvailabilityQuery(startDate, endDate),
    { home: 1, _id: 0 }
  ).lean();
  return [...new Set(overlappingBookings.map((b) => String(b.home)))];
};

const getAvailableHomes = async (
  filter = {},
  startDateInput,
  endDateInput,
  latitudeInput,
  longitudeInput,
  radiusKmInput
) => {
  const query = { ...filter };

  const latitude = Number.parseFloat(latitudeInput);
  const longitude = Number.parseFloat(longitudeInput);
  const radiusKm = Number.parseFloat(radiusKmInput);
  if (!Number.isNaN(latitude) && !Number.isNaN(longitude) && !Number.isNaN(radiusKm) && radiusKm >= 1 && radiusKm <= 15) {
    query.coordinates = {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [longitude, latitude],
        },
        $maxDistance: radiusKm * 1000,
      },
    };
  }

  if (!startDateInput || !endDateInput) {
    return Home.find(query);
  }
  const startDate = new Date(startDateInput);
  const endDate = new Date(endDateInput);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return Home.find(query);
  }
  const unavailableHomeIds = await getUnavailableHomeIds(startDate, endDate);
  query._id = { $nin: unavailableHomeIds };
  return Home.find(query);
};

const toRadians = (deg) => (deg * Math.PI) / 180;
const getDistanceKm = (lat1, lon1, lat2, lon2) => {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
};

const attachDistances = (homes, latitudeInput, longitudeInput) => {
  const latitude = Number.parseFloat(latitudeInput);
  const longitude = Number.parseFloat(longitudeInput);
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) return homes;

  return homes.map((homeDoc) => {
    const home = homeDoc.toObject ? homeDoc.toObject() : homeDoc;
    const coords = home.coordinates && Array.isArray(home.coordinates.coordinates) ? home.coordinates.coordinates : null;
    if (!coords || coords.length < 2) return home;
    const [lng, lat] = coords;
    if (typeof lat !== "number" || typeof lng !== "number") return home;
    const distanceKm = getDistanceKm(latitude, longitude, lat, lng);
    return { ...home, distanceKm: Number(distanceKm.toFixed(1)) };
  });
};

exports.getIndex = async (req, res, next) => {
  console.log("Session Value: ", req.session);
  const { startDate, endDate, latitude, longitude, radiusKm, location } = req.query;
  try {
    const homes = await getAvailableHomes({}, startDate, endDate, latitude, longitude, radiusKm);
    const registeredHomes = attachDistances(homes, latitude, longitude);
    res.render("store/index", {
      registeredHomes: registeredHomes,
      pageTitle: "HostKindle Home",
      currentPage: "index",
      isLoggedIn: req.isLoggedIn, 
      user: req.session.user,
      searchQuery: null,
      isSearchResults: false,
      filterDates: { startDate: startDate || "", endDate: endDate || "" },
      geoFilter: { latitude: latitude || "", longitude: longitude || "", radiusKm: radiusKm || "5", location: location || "" },
    });
  } catch (error) {
    console.error("Error loading index homes:", error);
    res.redirect("/homes");
  }
};

exports.getHomes = async (req, res, next) => {
  const { startDate, endDate, latitude, longitude, radiusKm, location } = req.query;
  try {
    const homes = await getAvailableHomes({}, startDate, endDate, latitude, longitude, radiusKm);
    const registeredHomes = attachDistances(homes, latitude, longitude);
    res.render("store/index", {
      registeredHomes: registeredHomes,
      pageTitle: "HostKindle Home",
      currentPage: "index",
      isLoggedIn: req.isLoggedIn, 
      user: req.session.user,
      searchQuery: null,
      isSearchResults: false,
      filterDates: { startDate: startDate || "", endDate: endDate || "" },
      geoFilter: { latitude: latitude || "", longitude: longitude || "", radiusKm: radiusKm || "5", location: location || "" },
    });
  } catch (error) {
    console.error("Error loading homes:", error);
    res.redirect("/");
  }
};

exports.getBookings = async (req, res, next) => {
  if (!req.isLoggedIn || !req.session.user) {
    return res.redirect("/login");
  }
  try {
    const bookings = await Booking.find({ user: req.session.user._id })
      .sort({ createdAt: -1 })
      .populate("home");

    const now = new Date();
    const normalizedBookings = bookings.map((b) => {
      if (b.status === "confirmed" && b.endDate && new Date(b.endDate) < now) {
        b.status = "completed";
      }
      return b;
    });

    res.render("store/bookings", {
      pageTitle: "My Bookings",
      currentPage: "bookings",
      isLoggedIn: req.isLoggedIn,
      user: req.session.user,
      bookings: normalizedBookings,
      error: null,
      success: req.query.success || null,
    });
  } catch (err) {
    console.error("Error loading bookings:", err);
    res.render("store/bookings", {
      pageTitle: "My Bookings",
      currentPage: "bookings",
      isLoggedIn: req.isLoggedIn,
      user: req.session.user,
      bookings: [],
      error: "Unable to load bookings right now.",
      success: null,
    });
  }
};

exports.getUserProfile = async (req, res) => {
  const { userId } = req.params;
  try {
    const profileUser = await User.findById(userId)
      .select("firstName lastName email userType favourites")
      .populate("favourites");
    if (!profileUser) {
      return res.redirect("/homes");
    }

    const bookings = await Booking.find({ user: userId })
      .sort({ createdAt: -1 })
      .populate("home");

    const now = new Date();
    const normalizedBookings = bookings.map((booking) => {
      if (booking.status === "confirmed" && booking.endDate && new Date(booking.endDate) < now) {
        booking.status = "completed";
      }
      return booking;
    });
    const activeBookings = normalizedBookings.filter(
      (booking) => booking.status === "confirmed" || booking.status === "pending"
    );
    const historyBookings = normalizedBookings.filter(
      (booking) => booking.status === "cancelled" || booking.status === "completed"
    );
    const totalSpent = normalizedBookings.reduce(
      (sum, booking) => sum + Number(booking.totalAmount || 0),
      0
    );

    return res.render("store/user-profile", {
      pageTitle: `${profileUser.firstName}'s Profile`,
      currentPage: "user-profile",
      isLoggedIn: req.isLoggedIn,
      user: req.session.user,
      profileUser,
      bookings: normalizedBookings,
      activeBookings,
      historyBookings,
      totalSpent,
      favouriteHomes: profileUser.favourites || [],
    });
  } catch (error) {
    console.error("Error loading user profile:", error);
    return res.redirect("/homes");
  }
};

exports.getFavouriteList = async (req, res, next) => {
  const userId = req.session.user._id;
  const user = await User.findById(userId).populate('favourites');
  res.render("store/favourite-list", {
    favouriteHomes: user.favourites,
    pageTitle: "My Favourites",
    currentPage: "favourites",
    isLoggedIn: req.isLoggedIn, 
    user: req.session.user,
  });
};

exports.postAddToFavourite = async (req, res, next) => {
  const homeId = req.body.id;
  if (!homeId) return res.redirect("/homes");
  const userId = req.session.user._id;
  const user = await User.findById(userId);
  const alreadyFav = user.favourites.some(f => String(f) === String(homeId));
  if (!alreadyFav) {
    user.favourites.push(homeId);
    await user.save();
  }
  res.redirect("/favourites");
};

exports.postRemoveFromFavourite = async (req, res, next) => {
  const homeId = req.params.homeId;
  const userId = req.session.user._id;
  const user = await User.findById(userId);
  const wasFav = user.favourites.some(f => String(f) === String(homeId));
  if (wasFav) {
    user.favourites = user.favourites.filter(fav => String(fav) !== String(homeId));
    await user.save();
  }
  res.redirect("/favourites");
};

// POST /favourites/toggle - Accepts JSON { id } and returns { success: true, action: 'added'|'removed' }
exports.postToggleFavourite = async (req, res, next) => {
  if (!req.isLoggedIn || !req.session.user) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }

  const homeId = req.body?.id ?? req.body?.homeId;
  if (!homeId) return res.status(400).json({ success: false, error: 'Missing home id' });

  try {
    const userId = req.session.user._id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    let action;
    const alreadyFav = user.favourites.some(f => String(f) === String(homeId));
    if (alreadyFav) {
      user.favourites = user.favourites.filter(fav => String(fav) !== String(homeId));
      action = 'removed';
    } else {
      user.favourites.push(homeId);
      action = 'added';
    }
    await user.save();

    // Optional: update session copy so subsequent renders reflect new state
    req.session.user = user;
    await req.session.save();

    return res.json({ success: true, action });
  } catch (err) {
    console.error('Error toggling favourite:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.getHomeDetails = async (req, res, next) => {
  const homeId = req.params.homeId;
  
  // Validate that homeId is a valid MongoDB ObjectId
  if (!homeId || typeof homeId !== 'string') {
    console.error("Invalid homeId:", homeId);
    return res.redirect("/homes");
  }
  
  // Check if it looks like a file path instead of an ObjectId
  if (homeId.includes('.png') || homeId.includes('.jpg') || homeId.includes('.jpeg') || homeId.includes('uploads')) {
    console.error("Received file path instead of ObjectId:", homeId);
    return res.redirect("/homes");
  }
  
  try {
    const home = await Home.findById(homeId);
    if (!home) {
      console.log("Home not found");
      return res.redirect("/homes");
    }

    // Ensure photos array is valid and properly formatted
    if (home.photos && Array.isArray(home.photos)) {
      home.photos = home.photos
        .filter(p => p && typeof p === 'string' && !p.includes('_id') && p.trim() !== '')
        .map(p => {
          // If it's already an absolute URL (Cloudinary), keep it as-is
          if (typeof p === 'string' && /^https?:\/\//i.test(p)) {
            return p;
          }
          // Normalize paths for web access
          let path = p.replace(/\\/g, '/').replace(/\/\//g, '/');
          if (!path.startsWith('/')) {
            path = '/' + path;
          }
          return path;
        });
    } else if (home.photo) {
      // If photos array doesn't exist but photo does, create array from single photo
      if (typeof home.photo === 'string' && /^https?:\/\//i.test(home.photo)) {
        home.photos = [home.photo];
      } else {
        let photoPath = home.photo.replace(/\\/g, '/').replace(/\/\//g, '/');
        if (!photoPath.startsWith('/')) {
          photoPath = '/' + photoPath;
        }
        home.photos = [photoPath];
      }
    }

    // Load comments for this home, newest first
    const comments = await Comment.find({ home: homeId })
      .sort({ createdAt: -1 })
      .populate({ path: "user", select: "firstName lastName userType" });

    // If logged in, get this user's rating for the home (to pre-fill the form)
    let userRating = null;
    if (req.isLoggedIn && req.session.user) {
      userRating = await Rating.findOne({ home: homeId, user: req.session.user._id });
    }

    let similarHomes = [];
    if (home.location) {
      const similarFilters = [{ location: new RegExp(home.location, "i") }];
      if (home.bhk) similarFilters.push({ bhk: home.bhk });
      similarFilters.push({
        price: {
          $gte: Math.max(0, Number(home.price || 0) - 5000),
          $lte: Number(home.price || 0) + 5000,
        },
      });
      similarHomes = await Home.find({
        _id: { $ne: home._id },
        $or: similarFilters,
      })
        .limit(4)
        .lean();
    }

    res.render("store/home-detail", {
      home: home,
      comments,
      userRating,
      similarHomes,
      pageTitle: "Home Detail",
      currentPage: "Home",
      isLoggedIn: req.isLoggedIn, 
      user: req.session.user,
    });
  } catch (error) {
    console.error("Error fetching home details:", error);
    res.redirect("/homes");
  }
};

// POST /homes/:homeId/book
exports.postBookHome = async (req, res, next) => {
  return res.redirect(`/homes/${req.params.homeId}`);
};

// GET /homes/:homeId/photos
// Renders a page showing ALL photos for the home in a grid; images are displayed using their uploaded dimensions (no cropping).
exports.getHomePhotos = async (req, res, next) => {
  const homeId = req.params.homeId;

  if (!homeId || typeof homeId !== 'string') {
    console.error('Invalid homeId for photos:', homeId);
    return res.redirect('/homes');
  }

  try {
    const home = await Home.findById(homeId);
    if (!home) return res.redirect('/homes');

    // Normalize photos the same way as in getHomeDetails
    let photos = [];
    if (home.photos && Array.isArray(home.photos)) {
      photos = home.photos
        .filter(p => p && typeof p === 'string' && !p.includes('_id') && p.trim() !== '')
        .map(p => {
          if (typeof p === 'string' && /^https?:\/\//i.test(p)) return p;
          let path = p.replace(/\\/g, '/').replace(/\/\//g, '/');
          if (!path.startsWith('/')) path = '/' + path;
          return path;
        });
    } else if (home.photo) {
      if (typeof home.photo === 'string' && /^https?:\/\//i.test(home.photo)) {
        photos = [home.photo];
      } else {
        let photoPath = home.photo.replace(/\\/g, '/').replace(/\/\//g, '/');
        if (!photoPath.startsWith('/')) photoPath = '/' + photoPath;
        photos = [photoPath];
      }
    }

    res.render('store/home-photos', {
      home,
      photos,
      pageTitle: `${home.houseName} - Photos`,
      isLoggedIn: req.isLoggedIn,
      user: req.session.user,
    });
  } catch (err) {
    console.error('Error fetching home photos:', err);
    res.redirect('/homes');
  }
};

exports.postComment = async (req, res, next) => {
  const homeId = req.params.homeId;
  const { text } = req.body;

  if (!req.isLoggedIn || !req.session.user) {
    return res.redirect("/login");
  }

  // Only guests can comment per requirement
  if (!req.session.user.userType || req.session.user.userType !== 'guest') {
    return res.redirect(`/homes/${homeId}`);
  }

  if (!text || text.trim() === "") {
    return res.redirect(`/homes/${homeId}#reviews`);
  }

  try {
    await Comment.create({
      home: homeId,
      user: req.session.user._id,
      text: text.trim(),
    });

    // After adding a new comment, regenerate and store the feedback summary
    try {
      const allComments = await Comment.find({ home: homeId }).sort({ createdAt: -1 });
      const commentTexts = allComments.map((c) => c.text);
      const summary = await summarizeComments(commentTexts);
      if (summary) {
        await Home.findByIdAndUpdate(homeId, { feedbackSummary: summary });
      }
    } catch (err) {
      console.error("Error updating feedback summary after new comment:", err);
    }
  } catch (error) {
    console.error("Error saving comment:", error);
  }

  res.redirect(`/homes/${homeId}#reviews`);
};

exports.getEditComment = async (req, res, next) => {
  const { homeId, commentId } = req.params;

  if (!req.isLoggedIn || !req.session.user) {
    return res.redirect(`/homes/${homeId}`);
  }

  // Only guests can edit their own comments
  if (!req.session.user.userType || req.session.user.userType !== 'guest') {
    return res.redirect(`/homes/${homeId}`);
  }

  try {
    const comment = await Comment.findById(commentId);
    if (!comment) return res.redirect(`/homes/${homeId}`);

    if (String(comment.user) !== String(req.session.user._id)) {
      return res.redirect(`/homes/${homeId}`);
    }

    res.render('store/edit-comment', {
      comment,
      homeId,
      pageTitle: 'Edit Comment',
      isLoggedIn: req.isLoggedIn,
      user: req.session.user,
    });
  } catch (error) {
    console.error('Error loading comment for edit:', error);
    res.redirect(`/homes/${homeId}`);
  }
};

exports.postEditComment = async (req, res, next) => {
  const { homeId, commentId } = req.params;
  const { text } = req.body;

  if (!req.isLoggedIn || !req.session.user) {
    return res.redirect(`/homes/${homeId}`);
  }

  if (!req.session.user.userType || req.session.user.userType !== 'guest') {
    return res.redirect(`/homes/${homeId}`);
  }

  if (!text || text.trim() === '') {
    return res.redirect(`/homes/${homeId}/comments/${commentId}/edit`);
  }

  try {
    const comment = await Comment.findById(commentId);
    if (!comment) return res.redirect(`/homes/${homeId}`);

    if (String(comment.user) !== String(req.session.user._id)) {
      return res.redirect(`/homes/${homeId}`);
    }

    comment.text = text.trim();
    await comment.save();

    // Regenerate and store the feedback summary after editing a comment
    try {
      const allComments = await Comment.find({ home: homeId }).sort({ createdAt: -1 });
      const commentTexts = allComments.map((c) => c.text);
      const summary = await summarizeComments(commentTexts);
      if (summary) {
        await Home.findByIdAndUpdate(homeId, { feedbackSummary: summary });
      }
    } catch (err) {
      console.error("Error updating feedback summary after editing comment:", err);
    }
  } catch (error) {
    console.error('Error updating comment:', error);
  }

  res.redirect(`/homes/${homeId}#reviews`);
};

exports.postDeleteComment = async (req, res, next) => {
  const { homeId, commentId } = req.params;

  if (!req.isLoggedIn || !req.session.user) {
    return res.redirect(`/homes/${homeId}`);
  }

  if (!req.session.user.userType || req.session.user.userType !== 'guest') {
    return res.redirect(`/homes/${homeId}`);
  }

  try {
    const comment = await Comment.findById(commentId);
    if (!comment) return res.redirect(`/homes/${homeId}`);

    if (String(comment.user) !== String(req.session.user._id)) {
      return res.redirect(`/homes/${homeId}`);
    }

    await Comment.deleteOne({ _id: commentId });

    // Regenerate and store the feedback summary after deleting a comment
    try {
      const allComments = await Comment.find({ home: homeId }).sort({ createdAt: -1 });
      const commentTexts = allComments.map((c) => c.text);
      const summary = await summarizeComments(commentTexts);
      await Home.findByIdAndUpdate(homeId, { feedbackSummary: summary || null });
    } catch (err) {
      console.error("Error updating feedback summary after deleting comment:", err);
    }
  } catch (error) {
    console.error('Error deleting comment:', error);
  }

  res.redirect(`/homes/${homeId}#reviews`);
};

// POST /homes/:homeId/rate
exports.postRateHome = async (req, res, next) => {
  const { homeId } = req.params;
  const { value } = req.body;

  if (!req.isLoggedIn || !req.session.user) {
    return res.redirect(`/homes/${homeId}`);
  }
  // Only guests are allowed to submit ratings.
  if (!req.session.user.userType || req.session.user.userType !== "guest") {
    return res.redirect(`/homes/${homeId}#rating`);
  }

  const userId = req.session.user._id;
  const ratingValue = parseInt(value, 10);
  if (isNaN(ratingValue) || ratingValue < 1 || ratingValue > 5) {
    return res.redirect(`/homes/${homeId}`);
  }

  try {
    // find existing rating by this user
    let rating = await Rating.findOne({ home: homeId, user: userId });
    if (rating) {
      rating.value = ratingValue;
      await rating.save();
    } else {
      rating = await Rating.create({ home: homeId, user: userId, value: ratingValue });
    }

    // Recompute average and count using all ratings for this home
    const allRatings = await Rating.find({ home: homeId });

    if (allRatings && allRatings.length > 0) {
      const count = allRatings.length;
      const sum = allRatings.reduce((acc, r) => acc + (r.value || 0), 0);
      const avg = sum / count;
      await Home.findByIdAndUpdate(homeId, { rating: avg, ratingCount: count });
    } else {
      // If no ratings remain for some reason, reset the home rating fields
      await Home.findByIdAndUpdate(homeId, { rating: 0, ratingCount: 0 });
    }
  } catch (error) {
    console.error('Error saving rating:', error);
  }

  res.redirect(`/homes/${homeId}#rating`);
};

exports.postSearch = async (req, res, next) => {
  const searchQuery = req.body.search || "";
  const { startDate, endDate, latitude, longitude, radiusKm } = req.body;
  
  const hasGeoFilter =
    !Number.isNaN(Number.parseFloat(latitude)) &&
    !Number.isNaN(Number.parseFloat(longitude)) &&
    !Number.isNaN(Number.parseFloat(radiusKm));
  const hasDateFilter = !!(startDate && endDate);
  if (searchQuery.trim() === "" && !hasGeoFilter && !hasDateFilter) {
    return res.redirect("/");
  }

  // Create a regex pattern for case-insensitive search
  const searchRegex = new RegExp(searchQuery.trim(), 'i');
  
  // Search in houseName, location, and description
  try {
    const baseFilter = searchQuery.trim()
      ? {
          $or: [
            { houseName: searchRegex },
            { location: searchRegex },
            { description: searchRegex },
          ],
        }
      : {};
    const homes = await getAvailableHomes(
      baseFilter,
      startDate,
      endDate,
      latitude,
      longitude,
      radiusKm
    );
    const searchResults = attachDistances(homes, latitude, longitude);
    res.render("store/index", {
      registeredHomes: searchResults,
      pageTitle: "Search Results - HostKindle",
      currentPage: "index",
      isLoggedIn: req.isLoggedIn, 
      user: req.session.user,
      searchQuery: searchQuery,
      isSearchResults: true,
      filterDates: { startDate: startDate || "", endDate: endDate || "" },
      geoFilter: { latitude: latitude || "", longitude: longitude || "", radiusKm: radiusKm || "5" },
    });
  } catch (error) {
    console.log("Search error:", error);
    res.redirect('/');
  }
};

exports.postCheckAvailability = async (req, res) => {
  const { homeId } = req.params;
  const { startDate, months } = req.body;

  try {
    const home = await Home.findById(homeId).lean();
    if (!home) {
      return res.status(404).json({ success: false, message: "Home not found." });
    }

    const range = normalizeDateRange(startDate, months);
    const overlap = await Booking.exists({
      home: homeId,
      ...buildAvailabilityQuery(range.startDate, range.endDate),
    });

    if (!overlap) {
      return res.json({ success: true, available: true });
    }

    const similarHomes = await Home.find({
      _id: { $ne: home._id },
      $or: [{ location: new RegExp(home.location, "i") }, { bhk: home.bhk }],
    })
      .limit(4)
      .select("_id houseName location price photos photo rating")
      .lean();

    return res.json({
      success: true,
      available: false,
      message: "This property is not available for selected period.",
      similarHomes,
    });
  } catch (error) {
    console.error("Availability check failed:", error);
    return res.status(500).json({ success: false, message: "Could not check availability." });
  }
};

exports.postCreateRazorpayOrder = async (req, res) => {
  if (!req.isLoggedIn || !req.session.user) {
    return res.status(401).json({ success: false, message: "Please login to continue." });
  }

  const { homeId } = req.params;
  const { startDate, months } = req.body;

  try {
    const home = await Home.findById(homeId).lean();
    if (!home) {
      return res.status(404).json({ success: false, message: "Home not found." });
    }
    if (String(home.owner) === String(req.session.user._id)) {
      return res.status(400).json({ success: false, message: "You cannot book your own property." });
    }

    const range = normalizeDateRange(startDate, months);
    const isBooked = await Booking.exists({
      home: homeId,
      ...buildAvailabilityQuery(range.startDate, range.endDate),
    });
    if (isBooked) {
      return res.status(409).json({
        success: false,
        message: "Selected period is already booked.",
      });
    }

    const totalAmount = Number(home.price) * range.months;
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({
        success: false,
        message: "Razorpay keys are not configured in environment.",
      });
    }

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const shortHomeId = String(homeId).slice(-8);
    const shortTs = Date.now().toString(36);
    const receipt = `bk_${shortHomeId}_${shortTs}`.slice(0, 40);

    const order = await razorpay.orders.create({
      amount: Math.round(totalAmount * 100),
      currency: "INR",
      receipt,
      notes: {
        homeId: String(homeId),
        userId: String(req.session.user._id),
        startDate: range.startDate.toISOString(),
        endDate: range.endDate.toISOString(),
        months: String(range.months),
      },
    });

    return res.json({
      success: true,
      order,
      key: process.env.RAZORPAY_KEY_ID,
      bookingDraft: {
        homeId,
        startDate: range.startDate,
        endDate: range.endDate,
        months: range.months,
        totalAmount,
      },
      user: {
        name: `${req.session.user.firstName || ""} ${req.session.user.lastName || ""}`.trim(),
        email: req.session.user.email || "",
      },
      home: {
        name: home.houseName,
      },
    });
  } catch (error) {
    console.error("Create Razorpay order failed:", error);
    return res.status(500).json({ success: false, message: "Unable to initiate payment." });
  }
};

exports.postVerifyRazorpayPayment = async (req, res) => {
  if (!req.isLoggedIn || !req.session.user) {
    return res.status(401).json({ success: false, message: "Please login to continue." });
  }

  const { homeId } = req.params;
  const {
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signature,
    startDate,
    months,
  } = req.body;

  try {
    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({ success: false, message: "Invalid payment response." });
    }

    const generated = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    if (generated !== signature) {
      return res.status(400).json({ success: false, message: "Payment signature verification failed." });
    }

    const home = await Home.findById(homeId).lean();
    if (!home) {
      return res.status(404).json({ success: false, message: "Home not found." });
    }

    const range = normalizeDateRange(startDate, months);

    const overlappingBooking = await Booking.findOne({
      home: homeId,
      ...buildAvailabilityQuery(range.startDate, range.endDate),
    });
    if (overlappingBooking) {
      return res.status(409).json({
        success: false,
        message: "This home got booked during checkout. Try another property.",
      });
    }

    await Booking.create({
      user: req.session.user._id,
      home: homeId,
      startDate: range.startDate,
      endDate: range.endDate,
      months: range.months,
      totalAmount: Number(home.price || 0) * range.months,
      paymentStatus: "paid",
      payment: {
        orderId,
        paymentId,
        signature,
        method: "razorpay",
        paidAt: new Date(),
      },
      status: "confirmed",
    });

    return res.json({ success: true, redirectUrl: "/bookings?success=Booking confirmed." });
  } catch (error) {
    console.error("Verify Razorpay payment failed:", error);
    return res.status(500).json({ success: false, message: "Payment verification failed." });
  }
};

exports.postCancelBooking = async (req, res) => {
  if (!req.isLoggedIn || !req.session.user) {
    return res.redirect("/login");
  }
  const { bookingId } = req.params;
  try {
    const booking = await Booking.findOne({ _id: bookingId, user: req.session.user._id });
    if (!booking) return res.redirect("/bookings");
    if (booking.status === "cancelled") return res.redirect("/bookings");
    booking.status = "cancelled";
    await booking.save();
    return res.redirect("/bookings?success=Booking cancelled.");
  } catch (error) {
    console.error("Cancel booking failed:", error);
    return res.redirect("/bookings?success=Unable to cancel booking.");
  }
};

exports.postModifyBooking = async (req, res) => {
  if (!req.isLoggedIn || !req.session.user) {
    return res.redirect("/login");
  }
  const { bookingId } = req.params;
  const { startDate, months } = req.body;

  try {
    const booking = await Booking.findOne({ _id: bookingId, user: req.session.user._id }).populate("home");
    if (!booking || !booking.home) return res.redirect("/bookings");
    if (booking.status === "cancelled") return res.redirect("/bookings");

    const range = normalizeDateRange(startDate, months);
    const overlappingBooking = await Booking.findOne({
      _id: { $ne: bookingId },
      home: booking.home._id,
      ...buildAvailabilityQuery(range.startDate, range.endDate),
    });
    if (overlappingBooking) {
      return res.redirect("/bookings?success=New selected dates are not available.");
    }

    booking.startDate = range.startDate;
    booking.endDate = range.endDate;
    booking.months = range.months;
    booking.totalAmount = Number(booking.home.price || 0) * range.months;
    await booking.save();
    return res.redirect("/bookings?success=Booking modified successfully.");
  } catch (error) {
    console.error("Modify booking failed:", error);
    return res.redirect("/bookings?success=Unable to modify booking.");
  }
};
