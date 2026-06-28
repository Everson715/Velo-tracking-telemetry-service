export type UserRole = 'driver' | 'passenger' | 'admin';

export type TripStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export type TelemetryEventType = 'HARD_BRAKE' | 'RAPID_ACCEL';

export interface JwtPayload {
  sub: string;
  iss: string;
  aud: string | string[];
  exp: number;
  roles: UserRole[];
  trip_id?: string;
}

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface PositionUpdate extends Coordinate {
  heading?: number;
  timestamp: string;
}

export interface DriverPosition extends Coordinate {
  driver_id: string;
  heading?: number;
  last_updated: string;
  online: boolean;
}

export interface TripPosition extends Coordinate {
  trip_id: string;
  last_updated: string;
}

export interface Breadcrumb extends Coordinate {
  timestamp: string;
}

export interface TelemetryEventInput {
  trip_id: string;
  event_type: TelemetryEventType;
  lat?: number;
  lng?: number;
}

export interface TripContext {
  trip_id: string;
  driver_id: string;
  passenger_id: string;
  status: TripStatus;
}

export interface NearbyDriverQuery {
  lat: number;
  lng: number;
  radius: number;
}
