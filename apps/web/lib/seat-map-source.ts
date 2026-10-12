import 'server-only';

import { getSeatMap as getSeatMapFromSnapshot } from './data';
import { apiIsReachable, graphqlRequest } from './graphql-client';
import { buildSeatMap as buildSnapshotSeatMap } from './seat-map';

import type { SeatMap } from '@repo/shared';

/**
 * Seat map for a flight.
 *
 * The API owns seat inventory — real seat ids, real statuses, real holds — so its
 * map is preferred. When the API is unreachable the snapshot layout is derived
 * instead, which keeps the booking screen usable offline.
 */

const SEAT_MAP_QUERY = /* GraphQL */ `
  query SeatMap($flightId: ID!) {
    seatMap(flightId: $flightId) {
      layoutId
      aircraftModel
      configuration
      summary {
        totalSeats
        available
        held
        booked
        blocked
      }
      cabins {
        cabin
        label
        columns
        rows {
          row
          isExitRow
          isBulkhead
          hasBassinet
          aislesAfter
          seats {
            id
            seatNumber
            row
            column
            cabin
            position
            status
            price
            isExitRow
            isBulkhead
            hasBassinet
            holdExpiresAt
          }
        }
      }
    }
  }
`;

interface ApiSeatMap {
  readonly seatMap: SeatMap;
}

export async function getSeatMap(flightId: string): Promise<SeatMap | null> {
  if (await apiIsReachable()) {
    try {
      const data = await graphqlRequest<ApiSeatMap, { flightId: string }>(
        SEAT_MAP_QUERY,
        { flightId },
        { tags: ['seat-map'] },
      );
      if (data.seatMap.cabins.length > 0) return data.seatMap;
    } catch {
      // Fall through to the snapshot.
    }
  }

  const record = getSeatMapFromSnapshot(flightId);
  return record ? buildSnapshotSeatMap(record) : null;
}
