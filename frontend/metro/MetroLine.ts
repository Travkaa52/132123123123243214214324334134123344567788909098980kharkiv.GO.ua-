import { MetroRoute } from '@/metro/MetroRoute';
import { MetroStation } from '@/metro/MetroStation';
import { MetroTrain } from '@/metro/MetroTrain';
import type { ResolvedDeparture } from '@/metro/MetroSchedule';
import type { MetroDayType, MetroDirection, MetroLineJson, MetroStationData } from '@/metro/types';

export type MetroStationLookup = (stopId: string) => MetroStationData | undefined;

/**
 * Одна лінія метро: id/номер/назва/колір + два напрямки руху (MetroRoute).
 */
export class MetroLine {
  readonly id: string;
  readonly number: string;
  readonly name: string;
  readonly color: string;

  readonly forwardRoute: MetroRoute;
  readonly backwardRoute: MetroRoute;

  private readonly departuresByDayType: Record<
    MetroDayType,
    { forward: ResolvedDeparture[]; backward: ResolvedDeparture[] }
  >;

  constructor(line: MetroLineJson, stationLookup: MetroStationLookup) {
    if (line.kind !== 'metro') {
      throw new Error(`MetroLine: маршрут "${line.id}" не є лінією метро (kind="${line.kind}")`);
    }

    this.id = line.id;
    this.number = line.number;
    this.name = line.name;
    this.color = line.color;

    const stationsForward = line.stopIds.map((stopId) => {
      const data = stationLookup(stopId);
      if (!data) {
        throw new Error(`MetroLine: станцію "${stopId}" не знайдено в базі зупинок (лінія "${line.id}")`);
      }
      return new MetroStation(data);
    });

    if (stationsForward.length < 2) {
      throw new Error(`MetroLine: лінія "${line.id}" повинна мати щонайменше 2 станції`);
    }

    this.forwardRoute = new MetroRoute(line, stationsForward, 'forward');
    this.backwardRoute = new MetroRoute(line, stationsForward, 'backward');

    this.departuresByDayType = {
      weekday: {
        forward: this.forwardRoute.schedule.buildDailyDepartures('weekday'),
        backward: this.backwardRoute.schedule.buildDailyDepartures('weekday')
      },
      weekend: {
        forward: this.forwardRoute.schedule.buildDailyDepartures('weekend'),
        backward: this.backwardRoute.schedule.buildDailyDepartures('weekend')
      }
    };
  }

  getRoute(direction: MetroDirection): MetroRoute {
    return direction === 'forward' ? this.forwardRoute : this.backwardRoute;
  }

  get stations(): readonly MetroStation[] {
    return this.forwardRoute.stations;
  }

  getActiveTrains(nowSec: number, dayType: MetroDayType): MetroTrain[] {
    const context = {
      lineId: this.id,
      lineNumber: this.number,
      lineName: this.name,
      lineColor: this.color
    };

    const trains: MetroTrain[] = [];
    const departures = this.departuresByDayType[dayType];

    this.collectActiveTrainsForRoute(
      this.forwardRoute,
      departures.forward,
      nowSec,
      context,
      trains
    );

    this.collectActiveTrainsForRoute(
      this.backwardRoute,
      departures.backward,
      nowSec,
      context,
      trains
    );

    return trains;
  }

  getNextDeparture(
    nowSec: number,
    dayType: MetroDayType,
    direction: MetroDirection = 'forward'
  ): ResolvedDeparture | undefined {
    const list = this.departuresByDayType[dayType][direction];
    return list.find((dep) => dep.departureAtSec > nowSec);
  }

  private collectActiveTrainsForRoute(
    route: MetroRoute,
    departures: readonly ResolvedDeparture[],
    nowSec: number,
    context: { lineId: string; lineNumber: string; lineName: string; lineColor: string },
    outTrains: MetroTrain[]
  ): void {
    for (let i = 0; i < departures.length; i++) {
      const dep = departures[i];
      const train = new MetroTrain(route, dep.departureAtSec, context);
      if (train.isActiveAt(nowSec)) {
        outTrains.push(train);
      }
    }
  }
}
