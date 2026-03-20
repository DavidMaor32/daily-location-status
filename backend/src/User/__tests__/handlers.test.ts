import { getTestDB } from "../../services/__tests__/database";
import { UserDal } from "../dal";
import { DBUser } from "../types";

const testDB = getTestDB();

describe("user handlers", () => {
  const userDal = new UserDal(testDB);

  describe("getAllUsersHandlers", () => {
    const getAllUsers = userDal.getAllUsers;

    test("empty db should return []", async () => {
      const expected: DBUser[] = [];
      const actual = await getAllUsers();

      expect(actual).toEqual(expected);
    });
  });
});
