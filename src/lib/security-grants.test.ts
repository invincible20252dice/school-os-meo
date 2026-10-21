import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const sql=(name:string)=>readFileSync(`scripts/sql/security/${name}.sql`,"utf8");
async function database() {
 const db=await PGlite.create();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
 CREATE TABLE "TargetDistrict"(id text PRIMARY KEY,"schoolId" text,name text);
 INSERT INTO "TargetDistrict" VALUES ('a','school-a','synthetic a'),('b','school-b','synthetic b');
 CREATE TABLE profiles(id uuid PRIMARY KEY,role text,school_id text,school_ids text[],full_name text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),status text);
 INSERT INTO profiles(id,role,school_id,school_ids,full_name,status) VALUES ('00000000-0000-0000-0000-000000000001','manager','school-a',ARRAY['school-a'],'A','active'),('00000000-0000-0000-0000-000000000002','manager','school-b',ARRAY['school-b'],'B','pending');
 CREATE FUNCTION touch_profile_time() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
 CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION touch_profile_time();
 ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
 CREATE POLICY profiles_select_own ON profiles FOR SELECT USING(auth.uid()=id);
 CREATE POLICY profiles_update_own ON profiles FOR UPDATE USING(auth.uid()=id) WITH CHECK(auth.uid()=id);
 GRANT ALL ON "TargetDistrict",profiles TO anon,authenticated,service_role;
 SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';`);
 return db;
}
it("one-table revoke blocks direct roles while preserving service and all rows; rollback restores ACL",async()=>{
 const db=await database();try {
 const before=(await db.query('TABLE "TargetDistrict"')).rows;
 await db.exec(sql('target-district-revoke'));
 for(const role of ['anon','authenticated']) {
  await db.exec(`SET ROLE ${role}`);
  for(const statement of ['SELECT * FROM "TargetDistrict"',`UPDATE "TargetDistrict" SET name='bad' WHERE id='a'`,`INSERT INTO "TargetDistrict" VALUES ('x','x','x')`,`DELETE FROM "TargetDistrict" WHERE id='a'`]) await expect(db.exec(statement)).rejects.toThrow(/permission denied/);
  await db.exec('RESET ROLE');
 }
 await db.exec('SET ROLE service_role');expect((await db.query('TABLE "TargetDistrict"')).rows).toEqual(before);await db.exec('RESET ROLE');
 expect((await db.query('TABLE "TargetDistrict"')).rows).toEqual(before);
 await db.exec(sql('target-district-restore'));
 expect((await db.query("SELECT has_table_privilege('authenticated','\"TargetDistrict\"','UPDATE') AS ok")).rows).toEqual([{ok:true}]);
 }finally{await db.close();}
},30000);
it("profiles permits own full_name only, rejects role/school/id/status changes and preserves service admin",async()=>{
 const db=await database();try {
 await db.exec(sql('profiles-name-only'));await db.exec('SET ROLE authenticated');
 expect((await db.query('SELECT * FROM profiles')).rows).toHaveLength(1);
 await db.exec("UPDATE profiles SET full_name='Renamed' WHERE id=auth.uid()");
 for(const assignment of ["role='admin'","status='active'","school_id='school-b'","school_ids=ARRAY['school-b']","id='00000000-0000-0000-0000-000000000002'","updated_at=now()","created_at=now()","full_name='x',role='admin'"]) await expect(db.exec(`UPDATE profiles SET ${assignment} WHERE id=auth.uid()`)).rejects.toThrow(/permission denied/);
 expect((await db.query("UPDATE profiles SET full_name='other' WHERE id='00000000-0000-0000-0000-000000000002' RETURNING id")).rows).toEqual([]);
 await db.exec('RESET ROLE; SET ROLE anon');await expect(db.exec("UPDATE profiles SET full_name='bad'")).rejects.toThrow(/permission denied/);
 await db.exec('RESET ROLE; SET ROLE service_role');await db.exec("UPDATE profiles SET status='active' WHERE id='00000000-0000-0000-0000-000000000002'");
 expect((await db.query('SELECT * FROM profiles')).rows).toHaveLength(2);
 await db.exec('RESET ROLE');await db.exec(sql('profiles-restore'));
 expect((await db.query("SELECT has_column_privilege('authenticated','profiles','role','UPDATE') AS ok")).rows).toEqual([{ok:true}]);
 }finally{await db.close();}
},30000);
