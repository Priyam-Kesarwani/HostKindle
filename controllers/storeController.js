const Home = require("../models/home");
const User = require("../models/user");
const Comment = require("../models/comment");
const Rating = require("../models/rating");
const Booking = require("../models/booking");
const mongoose = require('mongoose');
const { summarizeComments } = require("../utils/gemini");

exports.getIndex = (req, res, next) => {
  console.log("Session Value: ", req.session);
  Home.find().then((registeredHomes) => {
    res.render("store/index", {
      registeredHomes: registeredHomes,
      pageTitle: "HostKindle Home",
      currentPage: "index",
      isLoggedIn: req.isLoggedIn, 
      user: req.session.user,
      searchQuery: null,
      isSearchResults: false
    });
  });
};

exports.getHomes = (req, res, next) => {
  Home.find().then((registeredHomes) => {
    res.render("store/home-list", {
      registeredHomes: registeredHomes,
      pageTitle: "Homes List",
      currentPage: "Home",
      isLoggedIn: req.isLoggedIn, 
      user: req.session.user,
    });
  });
};

exports.getBookings = async (req, res, next) => {
  if (!req.isLoggedIn || !req.session.user) {
    return res.redirect("/login");
  }
  try {
    const bookings = await Booking.find({ user: req.session.user._id })
      .sort({ createdAt: -1 })
      .populate("home");

    res.render("store/bookings", {
      pageTitle: "My Bookings",
      currentPage: "bookings",
      isLoggedIn: req.isLoggedIn,
      user: req.session.user,
      bookings,
      error: null,
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
    });
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
  const userId = req.session.user._id;
  const user = await User.findById(userId);
  if (!user.favourites.includes(homeId)) {
    user.favourites.push(homeId);
    await user.save();
  }
  res.redirect("/favourites");
};

exports.postRemoveFromFavourite = async (req, res, next) => {
  const homeId = req.params.homeId;
  const userId = req.session.user._id;
  const user = await User.findById(userId);
  if (user.favourites.includes(homeId)) {
    user.favourites = user.favourites.filter(fav => fav != homeId);
    await user.save();
  }
  res.redirect("/favourites");
};

// POST /favourites/toggle - Accepts JSON { id } and returns { success: true, action: 'added'|'removed' }
exports.postToggleFavourite = async (req, res, next) => {
  if (!req.isLoggedIn || !req.session.user) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }

  const homeId = req.body.id;
  if (!homeId) return res.status(400).json({ success: false, error: 'Missing home id' });

  try {
    const userId = req.session.user._id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    let action;
    if (user.favourites.includes(homeId)) {
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

    res.render("store/home-detail", {
      home: home,
      comments,
      userRating,
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
  const { homeId } = req.params;
  if (!req.isLoggedIn || !req.session.user) {
    return res.redirect("/login");
  }

  try {
    const home = await Home.findById(homeId);
    if (!home) return res.redirect("/homes");

    // Prevent hosts booking their own home
    if (String(home.owner) === String(req.session.user._id)) {
      return res.redirect(`/homes/${homeId}`);
    }

    const startDate = req.body.startDate ? new Date(req.body.startDate) : new Date();
    const endDate =
      req.body.endDate && req.body.endDate.trim() !== ""
        ? new Date(req.body.endDate)
        : (() => {
            const d = new Date();
            d.setDate(d.getDate() + 30);
            return d;
          })();

    await Booking.create({
      user: req.session.user._id,
      home: homeId,
      startDate,
      endDate,
      status: "confirmed",
    });

    res.redirect("/bookings");
  } catch (err) {
    console.error("Error creating booking:", err);
    res.redirect(`/homes/${homeId}`);
  }
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

exports.postSearch = (req, res, next) => {
  const searchQuery = req.body.search;
  
  if (!searchQuery || searchQuery.trim() === '') {
    return res.redirect('/');
  }

  // Create a regex pattern for case-insensitive search
  const searchRegex = new RegExp(searchQuery.trim(), 'i');
  
  // Search in houseName, location, and description
  Home.find({
    $or: [
      { houseName: searchRegex },
      { location: searchRegex },
      { description: searchRegex }
    ]
  }).then((searchResults) => {
    res.render("store/index", {
      registeredHomes: searchResults,
      pageTitle: "Search Results - HostKindle",
      currentPage: "index",
      isLoggedIn: req.isLoggedIn, 
      user: req.session.user,
      searchQuery: searchQuery,
      isSearchResults: true
    });
  }).catch((error) => {
    console.log("Search error:", error);
    res.redirect('/');
  });
};
