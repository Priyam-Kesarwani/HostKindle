// External Module
const express = require("express");
const storeRouter = express.Router();

// Local Module
const storeController = require("../controllers/storeController");

storeRouter.get("/", storeController.getIndex);
storeRouter.get("/homes", storeController.getHomes);
storeRouter.get("/bookings", storeController.getBookings);
storeRouter.get("/favourites", storeController.getFavouriteList);
storeRouter.post("/search", storeController.postSearch);

storeRouter.post("/homes/:homeId/book", storeController.postBookHome);
storeRouter.get("/homes/:homeId", storeController.getHomeDetails);
// Show all photos page
storeRouter.get("/homes/:homeId/photos", storeController.getHomePhotos);
storeRouter.post("/homes/:homeId/comments", storeController.postComment);
storeRouter.post("/homes/:homeId/rate", storeController.postRateHome);
storeRouter.get("/homes/:homeId/comments/:commentId/edit", storeController.getEditComment);
storeRouter.post("/homes/:homeId/comments/:commentId/edit", storeController.postEditComment);
storeRouter.post("/homes/:homeId/comments/:commentId/delete", storeController.postDeleteComment);
storeRouter.post("/favourites", storeController.postAddToFavourite);
storeRouter.post("/favourites/toggle", storeController.postToggleFavourite);
storeRouter.post("/favourites/delete/:homeId", storeController.postRemoveFromFavourite);

module.exports = storeRouter;
