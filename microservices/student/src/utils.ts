import type { AddressInfo } from "node:net";

import os, { type NetworkInterfaceInfo } from "node:os";

export const getActiveNetworkInterfaces = () => {
  const { lo, ...networkInterfaces } = os.networkInterfaces();
  const activeNetworkInterfaces = Object.values(networkInterfaces)
    .flat()
    .filter(
      (networkInterface) =>
        typeof networkInterface !== "undefined" && !networkInterface.internal
    );

  return activeNetworkInterfaces as NetworkInterfaceInfo[];
};

export const formatAddress = (addressInfo: {
  address: string;
  family: string;
}) =>
  addressInfo.family === "IPv6"
    ? `[${addressInfo.address}]`
    : addressInfo.address;

export const formatHost = (addressInfo: AddressInfo) =>
  `${formatAddress(addressInfo)}:${addressInfo.port}`;
