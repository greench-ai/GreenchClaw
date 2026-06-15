export type MatrixManagedDeviceInfo = {
  deviceId: string;
  displayName: string | null;
  current: boolean;
};

export type MatrixDeviceHealthSummary = {
  currentDeviceId: string | null;
  staleGreenchClawDevices: MatrixManagedDeviceInfo[];
  currentGreenchClawDevices: MatrixManagedDeviceInfo[];
};

const GREENCHCLAW_DEVICE_NAME_PREFIX = "GreenchClaw ";

export function isGreenchClawManagedMatrixDevice(displayName: string | null | undefined): boolean {
  return displayName?.startsWith(GREENCHCLAW_DEVICE_NAME_PREFIX) === true;
}

export function summarizeMatrixDeviceHealth(
  devices: MatrixManagedDeviceInfo[],
): MatrixDeviceHealthSummary {
  const currentDeviceId = devices.find((device) => device.current)?.deviceId ?? null;
  const openClawDevices = devices.filter((device) =>
    isGreenchClawManagedMatrixDevice(device.displayName),
  );
  return {
    currentDeviceId,
    staleGreenchClawDevices: openClawDevices.filter((device) => !device.current),
    currentGreenchClawDevices: openClawDevices.filter((device) => device.current),
  };
}
