import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type BusinessType =
  | "restaurant_hotel"
  | "retail_store"
  | "hair_beauty"
  | "bookshop"
  | "procurement"
  | "others";

type BusinessSetup = {
  businessType: BusinessType | null;
  businessName: string;
  isSetupComplete: boolean;
  setBusinessType: (t: BusinessType) => void;
  setBusinessName: (name: string) => void;
  resetSetup: () => void;
};

const LS_TYPE = "sikatech_business_type";
const LS_NAME = "sikatech_business_name";

const BusinessSetupContext = createContext<BusinessSetup | undefined>(undefined);

export function BusinessSetupProvider({ children }: { children: ReactNode }) {
  const [businessType, setBusinessTypeState] = useState<BusinessType | null>(() => {
    const t = localStorage.getItem(LS_TYPE);
    return (t as BusinessType) || null;
  });

  const [businessName, setBusinessNameState] = useState<string>(() => {
    return localStorage.getItem(LS_NAME) || "";
  });

  const setBusinessType = (t: BusinessType) => {
    setBusinessTypeState(t);
    localStorage.setItem(LS_TYPE, t);
  };

  const setBusinessName = (name: string) => {
    setBusinessNameState(name);
    localStorage.setItem(LS_NAME, name);
  };

  const resetSetup = () => {
    setBusinessTypeState(null);
    setBusinessNameState("");
    localStorage.removeItem(LS_TYPE);
    localStorage.removeItem(LS_NAME);
  };

  const value = useMemo(
    () => ({
      businessType,
      businessName,
      isSetupComplete: !!businessType && businessName.trim().length > 0,
      setBusinessType,
      setBusinessName,
      resetSetup,
    }),
    [businessType, businessName]
  );

  return <BusinessSetupContext.Provider value={value}>{children}</BusinessSetupContext.Provider>;
}

export function useBusinessSetup() {
  const ctx = useContext(BusinessSetupContext);
  if (!ctx) throw new Error("useBusinessSetup must be used inside BusinessSetupProvider");
  return ctx;
}
