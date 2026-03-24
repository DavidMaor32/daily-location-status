import axios from "axios";
import { createTestApp, startTestServer } from "../../../services/__tests__/api";
import { StatusCodes } from "http-status-codes";
import {
  disconnectTestDatabase,
  resetTestDatabase,
  testDBClient,
} from "../../../services/__tests__/database";
import { LocationDal } from "../dal";
import { createLocationRouter } from "../router";

const validLocation = {
  name: "Home",
};

const updatedLocation = {
  name: "Base",
};

const invalidLocation = {
  randomVal: "random",
};

const randomId: string = "randomId";


describe("location router", () => {
  const locationDal = new LocationDal(testDBClient);
  const app = createTestApp("/locations", createLocationRouter(locationDal));
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

  test("GET /locations returns an empty array when there are no locations", async () => {
    const response = await httpClient.get(`${baseUrl}/locations`);

    expect(response.status).toBe(StatusCodes.OK);
    expect(response.data).toEqual([]);
  });

  test("GET /locations returns locations that exist in the database", async () => {
    await testDBClient.location.createMany({
      data: [validLocation, updatedLocation],
    });
    const createdLocations = await testDBClient.location.findMany();

    const response = await httpClient.get(`${baseUrl}/locations`);

    expect(response.status).toBe(StatusCodes.OK);
    expect(response.data).toEqual(createdLocations);
  });

  test("GET /locations/:id returns a location when the id exists", async () => {
    const createdLocation = await testDBClient.location.create({
      data: validLocation,
    });

    const response = await httpClient.get(
      `${baseUrl}/locations/${createdLocation.id}`
    );

    expect(response.status).toBe(StatusCodes.OK);
    expect(response.data).toEqual(createdLocation);
  });

  test("GET /locations/:id returns not found when the id does not exist", async () => {
    const response = await httpClient.get(`${baseUrl}/locations/99999`);

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    expect(response.data).toEqual(expect.any(String));
  });

  test("POST /locations creates a new location", async () => {
    const response = await httpClient.post(`${baseUrl}/locations`, validLocation);

    expect(response.status).toBe(StatusCodes.CREATED);
    expect(response.data).toMatchObject(validLocation);
  });

  test("POST /locations returns an error when the body is invalid", async () => {
    const response = await httpClient.post(`${baseUrl}/locations`, invalidLocation);

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    expect(response.data).toEqual(expect.any(String));
  });

  test("DELETE /locations/:id deletes an existing location", async () => {
    const createdLocation = await testDBClient.location.create({
      data: validLocation,
    });

    const response = await httpClient.delete(
      `${baseUrl}/locations/${createdLocation.id}`
    );

    expect(response.status).toBe(StatusCodes.NO_CONTENT);

    const deletedLocation = await testDBClient.location.findUnique({
      where: { id: createdLocation.id },
    });

    expect(deletedLocation).toBeNull();
  });

  test("DELETE /locations/:id returns not found when the id does not exist", async () => {
    const response = await httpClient.delete(`${baseUrl}/locations/99999`);

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    expect(response.data).toEqual(expect.any(String));
  });
});
