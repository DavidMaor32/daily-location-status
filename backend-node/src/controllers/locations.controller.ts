import { Request, Response } from "express";

type LocationsServiceLike = {
  getLocations: () => Promise<unknown>;
  addLocation: (location: unknown) => Promise<unknown>;
  deleteLocation: (locationName: string) => Promise<unknown>;
};

type LocationsControllerDependencies = {
  service: LocationsServiceLike;
};

const createLocationsController = ({ service }: LocationsControllerDependencies) => {
  const getLocations = async (_req: Request, res: Response) => {
    res.json({ locations: await service.getLocations() });
  };

  const addLocation = async (req: Request, res: Response) => {
    res.json({ locations: await service.addLocation(req.body?.location) });
  };

  const deleteLocation = async (req: Request, res: Response) => {
    const locationName = decodeURIComponent(req.params.location_name as string);
    res.json({ locations: await service.deleteLocation(locationName) });
  };

  return {
    getLocations,
    addLocation,
    deleteLocation,
  };
};

export { createLocationsController };
