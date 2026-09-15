export interface CapabilityResolver{resolve(permission:string):boolean|Promise<boolean>;}
export async function assertCapabilities(permissions:string[],resolver?:CapabilityResolver["resolve"]){for(const permission of permissions)if(resolver&&!await resolver(permission))return{ok:false as const,permission};return{ok:true as const};}
