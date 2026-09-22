import { useState } from "react";
import BrandLogo from "@/components/BrandLogo";
import AuthorizationDashboard from "@/pages/AuthorizationDashboard";

export default function App() {
  const [, setConnectionVersion] = useState(0);
  return <div className="app-root"><AuthorizationDashboard onConnectionChanged={() => setConnectionVersion((version) => version + 1)} /><footer className="brand-footer"><BrandLogo compact /><span>Beyond The Line · BTL Africa</span></footer></div>;
}
