import axios from "axios";
import { createTestApp, startTestServer } from "../../../services/__tests__/api";
import { StatusCodes } from "http-status-codes";
import {
  disconnectTestDatabase,
  resetTestDatabase,
  testDBClient,
} from "../../../services/__tests__/database";
import { LocationDal } from "../../Location/dal";
import { UserDal } from "../../User/dal";
import { LocationReportDal } from "../dal";
import { createLocationReportRouter } from "../router";

const validUser = {
  fullName: "Name Example",
  phone: "0501234567",
};

const validLocation = {
  name: "Home",
};

describe("location report router", () => {
  const userDal = new UserDal(testDBClient);
  const locationDal = new LocationDal(testDBClient);
  const locationReportDal = new LocationReportDal(
    testDBClient,
    userDal,
    locationDal
  );
  const app = createTestApp("/reports", createLocationReportRouter(locationReportDal));
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

  test("GET /reports returns an empty array when there are no reports", async () => {
    const response = await httpClient.get(`${baseUrl}/reports`);

    expect(response.status).toBe(StatusCodes.OK);
    expect(response.data).toEqual([]);
  });

  test("GET /reports returns reports that exist in the database", async () => {
    const user = await testDBClient.user.create({
      data: validUser,
    });
    const location = await testDBClient.location.create({
      data: validLocation,
    });
    await testDBClient.locationReport.create({
      data: {
        userId: user.id,
        locationId: location.id,
        occurredAt: new Date("2026-03-24T08:00:00.000Z"),
        isStatusOk: true,
        source: "ui",
      },
    });
    const createdReports = await testDBClient.locationReport.findMany();

    const response = await httpClient.get(`${baseUrl}/reports`);

    expect(response.status).toBe(StatusCodes.OK);
    expect(response.data).toEqual(
      createdReports.map((report) => ({
        ...report,
        occurredAt: report.occurredAt.toISOString(),
        createdAt: report.createdAt.toISOString(),
      }))
    );
  });

  test("GET /reports/:id returns a report when the id exists", async () => {
    const user = await testDBClient.user.create({
      data: validUser,
    });
    const location = await testDBClient.location.create({
      data: validLocation,
    });
    const createdReport = await testDBClient.locationReport.create({
      data: {
        userId: user.id,
        locationId: location.id,
        occurredAt: new Date("2026-03-24T08:00:00.000Z"),
        isStatusOk: true,
        source: "ui",
      },
    });

    const response = await httpClient.get(`${baseUrl}/reports/${createdReport.id}`);

    expect(response.status).toBe(StatusCodes.OK);
    expect(response.data).toEqual({
      ...createdReport,
      occurredAt: createdReport.occurredAt.toISOString(),
      createdAt: createdReport.createdAt.toISOString(),
    });
  });

  test("GET /reports/:id returns not found when the id does not exist", async () => {
    const response = await httpClient.get(`${baseUrl}/reports/99999`);

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    expect(response.data).toEqual(expect.any(String));
  });

  test("POST /reports creates a new report", async () => {
    const user = await testDBClient.user.create({
      data: validUser,
    });
    const location = await testDBClient.location.create({
      data: validLocation,
    });

    const response = await httpClient.post(`${baseUrl}/reports`, {
        userId: user.id,
        locationId: location.id,
        occurredAt: "2026-03-24T08:00:00.000Z",
        isStatusOk: true,
        source: "ui",
    });

    expect(response.status).toBe(StatusCodes.CREATED);
    expect(response.data).toMatchObject({
      userId: user.id,
      locationId: location.id,
      isStatusOk: true,
      source: "ui",
    });
  });

  test("POST /reports returns an error when the body is invalid", async () => {
    const response = await httpClient.post(`${baseUrl}/reports`, {
      randomVal: "random",
    });

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    expect(response.data).toEqual(expect.any(String));
  });

  test("POST /reports returns not found when the user does not exist", async () => {
    const location = await testDBClient.location.create({
      data: validLocation,
    });

    const response = await httpClient.post(`${baseUrl}/reports`, {
      userId: 99999,
      locationId: location.id,
      occurredAt: "2026-03-24T08:00:00.000Z",
      isStatusOk: true,
      source: "ui",
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    expect(response.data).toEqual(expect.any(String));
  });

  test("POST /reports returns not found when the location does not exist", async () => {
    const user = await testDBClient.user.create({
      data: validUser,
    });

    const response = await httpClient.post(`${baseUrl}/reports`, {
      userId: user.id,
      locationId: 99999,
      occurredAt: "2026-03-24T08:00:00.000Z",
      isStatusOk: true,
      source: "ui",
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    expect(response.data).toEqual(expect.any(String));
  });
});
