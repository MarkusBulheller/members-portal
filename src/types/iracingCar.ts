export interface IracingCar {
  carId: number;
  carName: string;
  carNameAbbreviated: string | null;
  carMake: string | null;
  carModel: string | null;
  categories: string | null;
  retired: boolean;
  smallImageUrl: string | null;
  logoUrl: string | null;
  syncedAt: string;
}
