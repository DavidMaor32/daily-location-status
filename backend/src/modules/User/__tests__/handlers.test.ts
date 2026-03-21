import { testDBClient } from "../../services/__tests__/database";
import { UserDal } from "../dal";
import { DBUser } from "../types";

describe("user handlers", () => {
  const userDal = new UserDal(testDBClient);

  describe("getAllUsersHandlers", () => {
    const getAllUsers = userDal.getAllUsers;

    test("empty db should return []", async () => {
      const expected: DBUser[] = [];
      const actual = await getAllUsers();

      expect(actual).toEqual(expected);
    });
  });
});
