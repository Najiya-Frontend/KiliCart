export const PLATFORM_ROLES = Object.freeze([
  { code: 'CUSTOMER', name: 'Customer', description: 'Uses customer marketplace services.' },
  { code: 'SELLER', name: 'Seller', description: 'Sells subject to business approval.' },
  { code: 'RIDER', name: 'Rider', description: 'Delivers subject to verification and approval.' },
  { code: 'ADMIN', name: 'Admin', description: 'Performs authorized marketplace administration.' },
  { code: 'SUPER_ADMIN', name: 'Super Admin', description: 'Holds highest-level platform administration privileges.' },
].map(Object.freeze));
export const ROLE_CODES = Object.freeze(PLATFORM_ROLES.map(({ code }) => code));
