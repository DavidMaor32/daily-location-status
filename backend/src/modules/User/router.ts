import { Router } from "express";
import multer from "multer";
import { MAX_EXCEL_UPLOAD_SIZE_BYTES } from "../../utils/constants";
import { ValidationError } from "../../utils/errors/client";
import { UserDal } from "./dal";
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
export const createUserRouter = (dal: UserDal) => {
  const router = Router();
  const decoratedHandlers = createDecoratedUserHandlers(dal);

  router.get("/", decoratedHandlers.getAllUsersHandler);
  router.get("/:id", decoratedHandlers.getUserById);
  router.put("/:id", decoratedHandlers.updateUser);
  router.post('/', decoratedHandlers.addUser);
  router.post('/excel', upload.single('file'),decoratedHandlers.addUsersFromExcel);

  return router;
};

export const createDecoratedUserHandlers = (dal: UserDal) => ({
  getAllUsersHandler: httpLogger(
    handlers.getAllUsersHandler(dal),
    "getAllUsersHandler",
  ),
  getUserById: httpLogger(handlers.getUserByIdHandler(dal), "getUserById"),
  updateUser: httpLogger(handlers.updateUser(dal), "updateUser"),
  addUser: httpLogger(handlers.AddUserHandler(dal), 'AddUser'),
  addUsersFromExcel: httpLogger(handlers.AddUsersFromExcelHandler(dal), 'AddUsersFromExcel'),
});
