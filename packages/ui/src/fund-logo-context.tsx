import { createContext } from "react";
import type { StockLogoRepository } from "@nomi/core";
export const FundLogoContext = createContext<Pick<
  StockLogoRepository,
  "get" | "peek"
> | null>(null);
