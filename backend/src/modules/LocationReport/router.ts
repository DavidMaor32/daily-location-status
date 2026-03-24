import { Router } from "express";
import { LocationReportDal } from "./dal";
import * as handlers from "./handlers";
import { httpLogger } from "../../utils/decorators";

export const createLocationReportRouter = (dal: LocationReportDal) => {
  const router = Router();
  const decoratedHandlers = createDecoratedLocationReportHandlers(dal);

  router.get("/", decoratedHandlers.getReportsHandler);
  router.get("/:id", decoratedHandlers.getReportByIdHandler);
  router.post("/", decoratedHandlers.addReportHandler);
  router.delete('/:id', decoratedHandlers.deleteReportHandler);

  return router;
};

export const createDecoratedLocationReportHandlers = (
  dal: LocationReportDal
) => ({
  getReportsHandler: httpLogger(
    handlers.getReportsHandler(dal),
    "getReportsHandler"
  ),
  getReportByIdHandler: httpLogger(
    handlers.getReportByIdHandler(dal),
    "getReportByIdHandler"
  ),
  addReportHandler: httpLogger(
    handlers.addReportHandler(dal),
    "addReportHandler"
  ),
  deleteReportHandler: httpLogger(
    handlers.deleteReportHandler(dal),
    'deleteReportHandler'
  )
});
