import { StatusCodes } from "http-status-codes";

export class HttpError extends Error {
    constructor(public readonly code: StatusCodes, public readonly message: string) {
        super(message);
    }
}

const entities = ['LocationReport', 'User', 'Location'] as const
export type EntityName = typeof entities[number]