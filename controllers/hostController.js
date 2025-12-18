const Home = require("../models/home");
const mongoose = require("mongoose");
const { generateDescriptionFromImageData, generateDescriptionFromContext } = require("../utils/gemini");
const { uploadBuffer } = require("../utils/cloudinary");

// Helper to get a safe Cloudinary URL from an upload result
const getSecureUrl = (result) => (result && (result.secure_url || result.url) ? (result.secure_url || result.url) : null);

exports.getAddHome = (req, res, next) => {
  res.render("host/edit-home", {
    pageTitle: "Add Home to HostKindle",
    currentPage: "addHome",
    editing: false,
    isLoggedIn: req.isLoggedIn,
    user: req.session.user,
  });
};

exports.getEditHome = (req, res, next) => {
  const homeId = req.params.homeId;
  const editing = req.query.editing === "true";

  const hostId = req.session.user && req.session.user._id;
  Home.findOne({ _id: homeId, owner: hostId }).then((home) => {
    if (!home) {
      console.log("Home not found for editing.");
      return res.redirect("/host/host-home-list");
    }

    console.log(homeId, editing, home);
    res.render("host/edit-home", {
      home: home,
      pageTitle: "Edit your Home",
      currentPage: "host-homes",
      editing: editing,
      isLoggedIn: req.isLoggedIn,
      user: req.session.user,
    });
  });
};

exports.getHostHomes = (req, res, next) => {
  const hostId = req.session.user && req.session.user._id;
  Home.find({ owner: hostId }).then((registeredHomes) => {
    res.render("host/host-home-list", {
      registeredHomes: registeredHomes,
      pageTitle: "Host Homes List",
      currentPage: "host-homes",
      isLoggedIn: req.isLoggedIn,
      user: req.session.user,
    });
  });
};

exports.postAddHome = async (req, res, next) => {
  // Rating is not set by hosts. It will be computed from user ratings on the details page.
  const { houseName, price, location, description, furnished, bhk, keywords } = req.body;
  console.log(houseName, price, location, description, furnished, bhk);
  console.log("Files:", req.files);

  if (!req.files || req.files.length === 0) {
    return res.status(422).send("No images provided");
  }

  // Upload all photos to Cloudinary and store their secure URLs
  let uploadedUrls = [];
  try {
    const uploads = await Promise.all(
      req.files.map((file) => uploadBuffer(file.buffer, { folder: 'hostkindle/homes' }))
    );
    uploadedUrls = uploads.map(getSecureUrl).filter(Boolean);
  } catch (err) {
    console.error("Error uploading images to Cloudinary:", err);
    return res.status(500).send("Error uploading images");
  }

  const photos = uploadedUrls;
  const photo = photos[0];

  // If host did not provide a description, try to generate one from the first uploaded image
  let finalDescription = description;
  if ((!description || description.trim() === "") && req.files && req.files[0]) {
    try {
      const base64 = req.files[0].buffer.toString('base64');
      const aiDescription = await generateDescriptionFromImageData(base64, req.files[0].mimetype || 'image/jpeg');
      if (aiDescription) {
        finalDescription = aiDescription;
      }
    } catch (err) {
      console.error("Error generating description from image:", err);
    }
  }

  console.log("Saving home with photos:", photos);
  console.log("Number of photos:", photos.length);

  const home = new Home({
    owner: req.session.user._id,
    houseName,
    price,
    location,
    // rating left to default (computed from user ratings)
    photo, // Main photo for backward compatibility
    photos, // Array of all photos
    description: finalDescription,
    furnished: (typeof furnished === 'string' && furnishingIsValid(furnished)) ? String(furnished) : 'Unfurnished',
    bhk: (typeof bhk === 'string' && bhk.trim() !== '') ? String(bhk) : undefined,
    keywords: Array.isArray(keywords)
      ? keywords.map(k => String(k).trim()).filter(Boolean).filter(k => k !== '1 BHK / 2 BHK / 3 BHK')
      : (typeof keywords === 'string'
          ? keywords.split(',').map(k => k.trim()).filter(Boolean).filter(k => k !== '1 BHK / 2 BHK / 3 BHK')
          : []),
  });
  home.save().then((savedHome) => {
    console.log("Home Saved successfully");
    console.log("Saved home photos:", savedHome.photos);
  }).catch((error) => {
    console.error("Error saving home:", error);
  });

  res.redirect("/host/host-home-list");
};

// POST /host/generate-description
// Accepts JSON: { image: base64WithoutPrefix, mimeType }
// Returns JSON: { description }
// Validate furnishing option
function furnishingIsValid(val) {
  return ['Unfurnished', 'Semi Furnished', 'Fully Furnished'].includes(val);
}

exports.postGenerateDescription = async (req, res, next) => {
  try {
    let { image, mimeType, keywords, furnished, bhk, homeId } = req.body;

    // keywords may be sent as array or CSV string
    let parsedKeywords = [];
    if (Array.isArray(keywords)) parsedKeywords = keywords;
    else if (typeof keywords === 'string' && keywords.trim() !== '') parsedKeywords = keywords.split(',').map(k => k.trim()).filter(Boolean);

    // If image isn't provided but a homeId is, we *could* try fetching an existing photo.
    // However, to keep this endpoint stable across Node versions (where global fetch may not exist),
    // we fall back to text-only generation when no local image/file is supplied.
    // The Gemini helper can still generate a useful description from context (keywords, furnished, bhk).

    // Now call the generator with whatever context (maybe image or text-only)
    const description = await generateDescriptionFromContext(image, mimeType || 'image/jpeg', parsedKeywords, furnished, bhk);

    if (!description) {
      return res.status(500).json({ error: "Failed to generate description" });
    }

    res.json({ description });
  } catch (err) {
    console.error("Error in postGenerateDescription:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.postEditHome = async (req, res, next) => {
  const { id, houseName, price, location, description, furnished, keywords } =
    req.body;
  
  console.log("Edit Home - ID:", id);
  console.log("Edit Home - Body:", req.body);
  console.log("Edit Home - Files:", req.files);
  
  // Validate that id exists and is not empty
  if (!id || id.trim() === '') {
    console.error("No ID provided in request body");
    return res.status(400).send("Home ID is required for editing");
  }
  
  // Validate that id is a valid MongoDB ObjectId
  if (!mongoose.Types.ObjectId.isValid(id)) {
    console.error("Invalid ObjectId format. Received:", id, "Type:", typeof id);
    return res.status(400).send(`Invalid home ID format: ${id}`);
  }
  
  try {
    const hostId = req.session.user && req.session.user._id;
    const home = await Home.findOne({ _id: id, owner: hostId });
    if (!home) {
      return res.redirect("/host/host-home-list");
    }
      home.houseName = houseName;
      home.price = price;
      home.location = location;
      // Keep existing rating unchanged; users set ratings from the details page
      home.description = description;
      home.furnished = (typeof furnished === 'string' && furnishingIsValid(furnished)) ? String(furnished) : 'Unfurnished';
      home.bhk = (typeof req.body.bhk === 'string' && req.body.bhk.trim() !== '') ? String(req.body.bhk) : undefined;
      if (Array.isArray(keywords)) {
        home.keywords = keywords.map(k => String(k).trim()).filter(Boolean).filter(k => k !== '1 BHK / 2 BHK / 3 BHK');
      } else if (typeof keywords === 'string') {
        home.keywords = keywords.split(',').map(k => k.trim()).filter(Boolean).filter(k => k !== '1 BHK / 2 BHK / 3 BHK');
      }

      // Handle multiple photo uploads
      if (req.files && req.files.length > 0) {
        // Upload new photos to Cloudinary and replace URLs
        try {
          const uploads = await Promise.all(
            req.files.map((file) => uploadBuffer(file.buffer, { folder: 'hostkindle/homes' }))
          );
          const newPhotos = uploads.map(getSecureUrl).filter(Boolean);
          if (newPhotos.length > 0) {
            home.photos = newPhotos;
            home.photo = newPhotos[0];
          }
        } catch (err) {
          console.error("Error uploading edited photos to Cloudinary:", err);
        }
      }

      await home.save();
      console.log("Home updated ", home._id);
      res.redirect("/host/host-home-list");
  } catch (err) {
    console.log("Error while editing home ", err);
    res.redirect("/host/host-home-list");
  }
};

exports.postDeleteHome = (req, res, next) => {
  const homeId = req.params.homeId;
  console.log("Came to delete ", homeId);
  const hostId = req.session.user && req.session.user._id;
  Home.findOneAndDelete({ _id: homeId, owner: hostId })
    .then(() => {
      res.redirect("/host/host-home-list");
    })
    .catch((error) => {
      console.log("Error while deleting ", error);
    });
};
