import { Router } from "express";
import multer from "multer";
import { MAX_EXCEL_UPLOAD_SIZE_BYTES } from "../../utils/constants";
import { ValidationError } from "../../utils/errors/client";
import { LocationDal } from "./dal";
import * as handlers from "./handlers";
import { httpLogger } from "../../utils/decorators";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_EXCEL_UPLOAD_SIZE_BYTES },
  fileFilter: (_, file, cb) => {
    const allowed = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ValidationError("Only .xlsx and .xls files are allowed"));
    }
  },
});

export const createLocationRouter = (dal: LocationDal) => {
  const router = Router();
  const decoratedHandlers = createDecoratedLocationHandlers(dal);

  router.get("/", decoratedHandlers.getAllLocationsHandler);
  router.get("/:id", decoratedHandlers.getLocationByIdHandler);
  router.post("/", decoratedHandlers.createLocationHandler);
  router.post("/excel", upload.single("file"), decoratedHandlers.addLocationsFromExcelHandler);

  return router;
};

export const createDecoratedLocationHandlers = (dal: LocationDal) => ({
  getAllLocationsHandler: httpLogger(
    handlers.getAllLocationsHandler(dal),
    "getAllLocationsHandler"
  ),
  getLocationByIdHandler: httpLogger(
    handlers.getLocationByIdHandler(dal),
    "getLocationByIdHandler"
  ),
  createLocationHandler: httpLogger(
    handlers.createLocationHandler(dal),
    "createLocationHandler"
  ),
  addLocationsFromExcelHandler: httpLogger(
    handlers.addLocationsFromExcelHandler(dal),
    "addLocationsFromExcel"
  ),
});