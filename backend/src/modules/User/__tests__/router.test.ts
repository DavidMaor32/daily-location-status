import axios from "axios";
import { createTestApp, startTestServer } from "../../../services/__tests__/api";
import { StatusCodes } from "http-status-codes";
import {
  disconnectTestDatabase,
  resetTestDatabase,
  testDBClient,
} from "../../../services/__tests__/database";
import { UserDal } from "../dal";
import { createUserRouter } from "../router";
import { PlainUser } from "../types";

const validUser: PlainUser = {
  fullName: "Name Last",
  phone: "0501234567",
}

const updatedValidUser: PlainUser = {
  fullName: "Updated Name",
  phone: "0509876543"
}

const randomObject = {
  randomVal: "random"
}

const randomId: string = "randomId";


describe("user router", () => {
  const userDal = new UserDal(testDBClient);
  const app = createTestApp("/users", createUserRouter(userDal));
  const httpClient = axios.create({
    validateStatus: () => true,
  });
  let baseUrl: string;
  let closeServer: () => Promise<void>;

  beforeAll(async () => {
    const server = await startTestServer(app);
    baseUrl = server.baseUrl;
    closeServer = server.close;
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterAll(async () => {
    await closeServer();
    await disconnectTestDatabase();
  });


  test("GET /users returns an empty array when there are no users", async () => {
    const response = await httpClient.get(`${baseUrl}/users`);

    expect(response.status).toBe(StatusCodes.OK);
    expect(response.data).toEqual([]);
  });

  test("GET /users returns users that exist in the database", async () => {
    await testDBClient.user.createMany({
      data: [validUser, updatedValidUser]
    });
    const createdUsers = await testDBClient.user.findMany();

    const response = await httpClient.get(`${baseUrl}/users`);

    expect(response.status).toBe(StatusCodes.OK);
    expect(response.data).toEqual(createdUsers);
  });

  test("GET /users/:id returns a user when the id exists", async () => {
    const createdUser = await testDBClient.user.create({
      data: validUser,
    });

    const response = await httpClient.get(`${baseUrl}/users/${createdUser.id}`);

    expect(response.status).toBe(StatusCodes.OK);
    expect(response.data).toEqual(createdUser);
  });

  test("GET /users/:id returns not found when the id does not exist", async () => {
    const response = await httpClient.get(`${baseUrl}/users/99999`);

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    expect(response.data).toEqual(expect.any(String));
  });



  test("POST /users creates a new user", async () => {
    const response = await httpClient.post(`${baseUrl}/users`, validUser);

    expect(response.status).toBe(StatusCodes.CREATED);
    expect(response.data).toMatchObject(validUser);
  });

  test("POST /users/ creates a new user", async () => {
    const response = await httpClient.post(`${baseUrl}/users/`, validUser);

    expect(response.status).toBe(StatusCodes.CREATED);
    expect(response.data).toMatchObject(validUser);
  });

  test("POST /users returns an error when the body is invalid", async () => {
    const response = await httpClient.post(`${baseUrl}/users`,randomObject);

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    expect(response.data).toEqual(expect.any(String));
  });

  test("PUT /users/:id updates an existing user", async () => {
    const user = await testDBClient.user.create({
      data: validUser,
    });

    const response = await httpClient.put(`${baseUrl}/users/${user.id}`, updatedValidUser);

    expect(response.status).toBe(StatusCodes.NO_CONTENT);

    const updatedUser = await testDBClient.user.findUnique({
      where: { id: user.id },
    });

    expect(updatedUser).toMatchObject({
      id: user.id,
      ...updatedValidUser
    });
  });

  test("PUT /users/:id returns an error when the body is invalid", async () => {
    const user = await testDBClient.user.create({
      data: validUser,
    });

    const response = await httpClient.put(`${baseUrl}/users/${user.id}`, {
      phone: 12345,
    });

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    expect(response.data).toEqual(expect.any(String));
  });

  test("PUT /users/:id returns not found when the user does not exist", async () => {
    const response = await httpClient.put(`${baseUrl}/users/99999`, updatedValidUser);

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    expect(response.data).toEqual(expect.any(String));
  });
});

//TODO: post /excel
