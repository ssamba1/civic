import type { ReportCategory, Department } from "@/lib/types";

export interface Open311Service {
  service_code: string;
  service_name: string;
  description: string;
  metadata: boolean;
  type: "realtime" | "batch" | "blackbox";
  keywords: string;
  group: string;
}

/** Map Civic categories → Open311 service definitions */
const SERVICE_DEFINITIONS: Record<ReportCategory, Open311Service> = {
  pothole: {
    service_code: "pothole",
    service_name: "Pothole",
    description: "Report a pothole on a city-maintained road or parking lot",
    metadata: false,
    type: "realtime",
    keywords: "pothole,road,pavement,asphalt",
    group: "Roads & Bridges",
  },
  streetlight: {
    service_code: "streetlight",
    service_name: "Streetlight Outage",
    description: "Report a broken, flickering, or damaged streetlight",
    metadata: false,
    type: "realtime",
    keywords: "streetlight,light,lamp,outage",
    group: "Electrical",
  },
  downed_sign: {
    service_code: "downed_sign",
    service_name: "Downed Sign",
    description: "Report a fallen, damaged, or missing road sign",
    metadata: false,
    type: "realtime",
    keywords: "sign,fallen,missing,traffic",
    group: "Signs & Signals",
  },
  graffiti: {
    service_code: "graffiti",
    service_name: "Graffiti Removal",
    description: "Report graffiti on public or private property visible from the street",
    metadata: false,
    type: "realtime",
    keywords: "graffiti,vandalism,paint,tagging",
    group: "Sanitation",
  },
  illegal_dump: {
    service_code: "illegal_dump",
    service_name: "Illegal Dumping",
    description: "Report illegally dumped trash, furniture, or debris",
    metadata: false,
    type: "realtime",
    keywords: "dumping,trash,illegal,waste",
    group: "Sanitation",
  },
  water_leak: {
    service_code: "water_leak",
    service_name: "Water Leak",
    description: "Report a water main break or visible water leak in the right-of-way",
    metadata: false,
    type: "realtime",
    keywords: "water,leak,main,break,flooding",
    group: "Water & Sewer",
  },
  sidewalk_damage: {
    service_code: "sidewalk_damage",
    service_name: "Sidewalk Damage",
    description: "Report cracked, buckled, or missing sidewalk panels",
    metadata: false,
    type: "realtime",
    keywords: "sidewalk,concrete,crack,trip,hazard",
    group: "Roads & Bridges",
  },
  tree_down: {
    service_code: "tree_down",
    service_name: "Downed Tree",
    description: "Report a fallen tree or large branch blocking a road or sidewalk",
    metadata: false,
    type: "realtime",
    keywords: "tree,branch,fallen,blocking",
    group: "Parks & Trees",
  },
  debris: {
    service_code: "debris",
    service_name: "Road Debris",
    description: "Report debris on a roadway creating a driving hazard",
    metadata: false,
    type: "realtime",
    keywords: "debris,road,hazard,obstruction",
    group: "Roads & Bridges",
  },
  drainage: {
    service_code: "drainage",
    service_name: "Drainage Issue",
    description: "Report a clogged storm drain or standing water on roadway",
    metadata: false,
    type: "realtime",
    keywords: "drain,storm,flooding,standing water,culvert",
    group: "Water & Sewer",
  },
  faded_signage: {
    service_code: "faded_signage",
    service_name: "Faded Signage",
    description: "Report a road sign that is faded, illegible, or needs replacement",
    metadata: false,
    type: "realtime",
    keywords: "sign,faded,illegible,worn",
    group: "Signs & Signals",
  },
  other: {
    service_code: "other",
    service_name: "Other Infrastructure Issue",
    description: "Report an infrastructure problem not covered by other categories",
    metadata: false,
    type: "realtime",
    keywords: "other,infrastructure,general",
    group: "General",
  },
};

/** Map Civic categories → responsible department for Open311 agency_responsible */
const CATEGORY_DEPARTMENT: Record<ReportCategory, Department> = {
  pothole: "public_works",
  streetlight: "utilities",
  downed_sign: "code_enforcement",
  graffiti: "sanitation",
  illegal_dump: "sanitation",
  water_leak: "utilities",
  sidewalk_damage: "public_works",
  tree_down: "parks",
  debris: "public_works",
  drainage: "utilities",
  faded_signage: "code_enforcement",
  other: "other",
};

const DEPARTMENT_LABELS: Record<Department, string> = {
  public_works: "Public Works",
  utilities: "Utilities Department",
  code_enforcement: "Code Enforcement",
  parks: "Parks & Recreation",
  sanitation: "Sanitation Department",
  other: "General Services",
};

/** All Open311 services */
export function getAllServices(): Open311Service[] {
  return Object.values(SERVICE_DEFINITIONS);
}

/** Lookup a single service by code — returns undefined if not found */
export function getService(code: string): Open311Service | undefined {
  return SERVICE_DEFINITIONS[code as ReportCategory];
}

/** Get the department for a category */
export function getDepartment(category: ReportCategory): Department {
  return CATEGORY_DEPARTMENT[category];
}

/** Human-readable agency name from category + city name */
export function getAgencyResponsible(
  category: ReportCategory,
  cityName: string
): string {
  const dept = CATEGORY_DEPARTMENT[category];
  return `${cityName} ${DEPARTMENT_LABELS[dept]}`;
}
