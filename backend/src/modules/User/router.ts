import { Router } from "express";
import { excelUpload } from "../../utils/middlewares";
import { UserDal } from "./dal";
import * as handlers from "./handlers";
import { httpLogger } from "../../utils/decorators";
export const createUserRouter = (dal: UserDal) => {
  const router = Router();
  const decoratedHandlers = createDecoratedUserHandlers(dal);

  router.get("/", decoratedHandlers.getAllUsersHandler);
  router.get("/:id", decoratedHandlers.getUserById);
  router.put("/:id", decoratedHandlers.updateUser);
  router.delete("/:id", decoratedHandlers.deleteUser);
  router.post('/', decoratedHandlers.addUser);
  router.post('/excel', excelUpload.single('file'),decoratedHandlers.addUsersFromExcel);

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
  deleteUser: httpLogger(handlers.deleteUserHandler(dal), 'deleteUser'),
  addUsersFromExcel: httpLogger(handlers.AddUsersFromExcelHandler(dal), 'AddUsersFromExcel'),
});
