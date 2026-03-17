import { Request, Response} from 'express'
import { genericResponse } from '../helper'

const getHealth = async(req: Request, res: Response) => {
    const response = genericResponse(true, 'health check', null, null, {status: 'ok', startup_ok: true, startup_error: null});
    res.status(200).json(response);
    return;

}

export { getHealth }    