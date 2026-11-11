// `virtual:goose-kettle` (web/kettle-data.ts): recorded week 1, the site's one story, built when the page is built.
declare module "virtual:goose-kettle" {
  import type { LedgerEvent } from "@goose/core";
  import type { WalletHome } from "@goose/core/wallet";
  export interface KettleData {
    home: WalletHome;
    events: LedgerEvent[];
    control: { orderId: string; amount: string; status: string; ranAt: string };
  }
  const data: KettleData;
  export default data;
}
