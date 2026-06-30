import "@internationalized/date";

export {};

declare global {
  type BluetoothServiceUUID = string | number;

  interface BluetoothLEScanFilter {
    name?: string;
    namePrefix?: string;
    services?: BluetoothServiceUUID[];
  }

  interface BluetoothDevice {
    readonly id: string;
    readonly name?: string;
  }

  interface BluetoothRemoteGATTServer {
    readonly connected: boolean;
  }
}

declare module "@internationalized/date" {
  export type DayOfWeek = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
}
