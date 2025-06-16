import type { NavbarProps } from "@heroui/react";
import { NavLink } from "react-router";
import { Navbar, NavbarBrand, NavbarContent, NavbarItem } from "@heroui/react";
import { cn } from "@heroui/react";
import { Icon } from "@iconify/react";
import { ThemeSwitcher } from "./theme-switcher";

import type { SVGProps } from "react";

export type IconSvgProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

// Define a type for navigation links
interface NavItem {
  path: string;
  label: string;
  icon: string;
}

// Create an array of navigation links
const navItems: NavItem[] = [
  {
    path: "/record",
    label: "Records",
    icon: "lucide:database",
  },
  {
    path: "/query",
    label: "SOQL",
    icon: "lucide:terminal",
  },
  {
    path: "/requests",
    label: "Requests",
    icon: "lucide:send",
  },
  {
    path: "/settings",
    label: "Settings",
    icon: "lucide:settings",
  },
];

export default function Component(props: NavbarProps) {
  return (
    <Navbar
      {...props}
      isBordered
      classNames={{
        base: cn("border-default-100 w-full", {
          "bg-default-200/50 dark:bg-default-100/50": false,
        }),
        wrapper: "w-full px-4 justify-between max-w-full",
        item: "flex",
      }}
      height="40px"
    >
      <NavbarContent justify="start" className="flex-grow">
        {/* Map through the navItems array to render NavbarItems */}
        {navItems.map((item) => (
          <NavbarItem key={item.path}>
            <NavLink
              to={item.path}
              className={({ isActive, isPending }) =>
                cn(
                  "flex items-center gap-2 py-2 px-1 border-b-2 transition-colors",
                  isPending
                    ? "text-warning border-warning animate-pulse"
                    : isActive
                      ? "text-primary border-primary font-medium"
                      : "text-default-500 border-transparent hover:text-foreground",
                )
              }
            >
              <Icon icon={item.icon} />
              {item.label}
            </NavLink>
          </NavbarItem>
        ))}
      </NavbarContent>

      {/* Add ThemeSwitcher */}
      <NavbarContent justify="end" className="flex-shrink-0 mr-4">
        <NavbarItem>
          <ThemeSwitcher />
        </NavbarItem>
      </NavbarContent>

      {/* Logo */}
      <NavbarBrand className="flex-shrink-0 flex-grow-0 pr-12">
        <div className="rounded-full bg-foreground text-background">
          <Icon icon="lucide:zap" width={16} height={16} />
        </div>
        <span className="ml-2 text-small font-medium">
          Lightning Lens for Salesforce
        </span>
      </NavbarBrand>
    </Navbar>
  );
}
