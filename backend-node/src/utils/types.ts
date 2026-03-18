export interface EntityWithId {
	id: number;
}

export interface Person extends EntityWithId {
	name: string;
	telegram_user_id?: string;
}

export interface Location extends EntityWithId {
	name: string;
}

const sources = ['ui', 'bot'] as const;
type Source = (typeof sources)[number];

export interface LocationReport extends EntityWithId {
	personId: number;
	location: number;
	occurredAt: Date;
	createdAt: Date;
	isDailyStatusOk?: boolean;
	source: Source;
		
}

