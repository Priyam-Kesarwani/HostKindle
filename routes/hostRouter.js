// External Module
const express = require("express");
const multer = require("multer");
const path = require("path");
const hostRouter = express.Router();

// Local Module
const hostController = require("../controllers/hostController");

// Multer configuration for multiple photos
const randomString = (length) => {
  const characters = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// Store uploads in memory; we'll push them to Cloudinary in controllers
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'image/png' || file.mimetype === 'image/jpg' || file.mimetype === 'image/jpeg') {
    cb(null, true);
  } else {
    cb(null, false);
  }
}

const uploadMultiple = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 8 * 1024 * 1024 } // 8MB per file
}).array('photos', 10); // Allow up to 10 photos

hostRouter.get("/add-home", hostController.getAddHome);
hostRouter.post("/add-home", uploadMultiple, hostController.postAddHome);
hostRouter.get("/host-home-list", hostController.getHostHomes);
hostRouter.get("/edit-home/:homeId", hostController.getEditHome);
hostRouter.post("/edit-home", uploadMultiple, hostController.postEditHome);
hostRouter.post("/delete-home/:homeId", hostController.postDeleteHome);
hostRouter.post("/generate-description", hostController.postGenerateDescription);

module.exports = hostRouter;
