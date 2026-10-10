import { beforeEach, expect, it, vi } from "vitest";
import { GET as instagramGet, POST as instagramPost } from "@/app/api/dashboard/settings/instagram/route";
import { POST as gbpPost } from "@/app/api/google/gbp-location-selection/route";
import { GET as alertsGet, PATCH as alertsPatch } from "@/app/api/dashboard/churn-alert/route";
import { resolveRequestAccess } from "./supabase-access";
import { prisma } from "./prisma";
vi.mock("./supabase-access", async importOriginal => ({ ...await importOriginal<typeof import("./supabase-access")>(), resolveRequestAccess: vi.fn() }));
vi.mock("./prisma", () => ({prisma:{school:{findUnique:vi.fn(),update:vi.fn()},instagramSetting:{findUnique:vi.fn(),upsert:vi.fn()},schoolSetting:{findUnique:vi.fn(),upsert:vi.fn()},googleAccount:{upsert:vi.fn()},churnAlert:{findMany:vi.fn(),update:vi.fn()},$transaction:vi.fn(async x=>Promise.all(x))}}));
const access=(role="manager",status="active",authenticated=true)=>({isAuthenticated:authenticated,access:{userId:"fixture-user",role,schoolId:"school-a",schoolIds:["school-a"],status,name:"Synthetic",email:"fixture@example.invalid",source:"profiles"}});
const req=(method:string,school="school-a")=>new Request(`http://localhost/api?schoolId=${school}`,{method,...(method!=="GET"?{body:JSON.stringify({schoolId:school,locationName:"123",alertId:"alert-b",status:"OPEN",metaAppSecret:"********"})}:{})});
beforeEach(()=>{vi.resetAllMocks();vi.mocked(resolveRequestAccess).mockResolvedValue(access() as never);vi.mocked(prisma.school.findUnique).mockResolvedValue({id:"school-a",status:"ACTIVE"} as never);});
const routes=[["instagram GET",instagramGet,"GET"],["instagram POST",instagramPost,"POST"],["GBP POST",gbpPost,"POST"],["alerts GET",alertsGet,"GET"],["alerts PATCH",alertsPatch,"PATCH"]] as const;
it.each(routes)("%s rejects unauthenticated/pending/other school before business queries",async (_,handler,method)=>{
 for (const [auth,school,code] of [[access("admin","active",false),"school-a",401],[access("manager","pending"),"school-a",403],[access(),"school-b",403]] as const) {
  vi.mocked(resolveRequestAccess).mockResolvedValue(auth as never);
  expect((await handler(req(method,school))).status).toBe(code);
 }
 for(const model of [prisma.school,prisma.instagramSetting,prisma.schoolSetting,prisma.googleAccount,prisma.churnAlert]) for(const fn of Object.values(model)) expect(fn).not.toHaveBeenCalled();
 expect(resolveRequestAccess).toHaveBeenCalledWith(expect.any(Request),expect.any(URL),undefined,{requireActiveProfile:true});
});
it("Instagram masks stored credentials and a masked save preserves them",async()=>{
 vi.mocked(prisma.instagramSetting.findUnique).mockResolvedValue({metaAppSecret:"PRIVATE_SECRET",instagramAccessToken:"PRIVATE_TOKEN",instagramBusinessAccountId:"id"} as never);
 vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValue({instagramMetaAppSecret:"PRIVATE_OTHER"} as never);
 expect(JSON.stringify(await (await instagramGet(req("GET"))).json())).not.toMatch(/PRIVATE_/);
 vi.mocked(prisma.instagramSetting.upsert).mockResolvedValue({metaAppSecret:"PRIVATE_SECRET"} as never);
 vi.mocked(prisma.schoolSetting.upsert).mockResolvedValue({instagramMetaAppSecret:"PRIVATE_OTHER"} as never);
 expect((await instagramPost(req("POST"))).status).toBe(200);
 expect(vi.mocked(prisma.instagramSetting.upsert).mock.calls[0][0].update.metaAppSecret).toBeUndefined();
 expect(vi.mocked(prisma.schoolSetting.upsert).mock.calls[0][0].update.instagramMetaAppSecret).toBeUndefined();
});
it("GBP selection never selects or serializes the account refresh token",async()=>{
 vi.mocked(prisma.$transaction).mockResolvedValue([{id:"school-a"},{updatedAt:new Date(),googleRefreshToken:"PRIVATE_SETTING"},{id:"g",schoolId:"school-a",refreshToken:"PRIVATE_ACCOUNT",email:"PRIVATE_EMAIL"}] as never);
 const result=await gbpPost(req("POST"));expect(result.status).toBe(200);
 expect(JSON.stringify(await result.json())).not.toMatch(/PRIVATE_/);
 expect(vi.mocked(prisma.googleAccount.upsert).mock.calls[0][0].select).toEqual({id:true,schoolId:true,locationId:true,status:true,updatedAt:true});
});
it.each(["manager","admin"])("%s alert updates are atomically school-scoped; another school ID is not updated",async role=>{
 vi.mocked(resolveRequestAccess).mockResolvedValue(access(role) as never);
 vi.mocked(prisma.churnAlert.update).mockRejectedValue({code:"P2025"});
 expect((await alertsPatch(req("PATCH"))).status).toBe(404);
 expect(prisma.churnAlert.update).toHaveBeenCalledWith(expect.objectContaining({where:{id:"alert-b",schoolId:"school-a"}}));
});
