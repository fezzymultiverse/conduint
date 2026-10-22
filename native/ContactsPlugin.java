package com.fezzy.conduint;

import android.Manifest;
import android.content.ContentProviderOperation;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.provider.ContactsContract;
import android.provider.ContactsContract.CommonDataKinds.Email;
import android.provider.ContactsContract.CommonDataKinds.Event;
import android.provider.ContactsContract.CommonDataKinds.Nickname;
import android.provider.ContactsContract.CommonDataKinds.Note;
import android.provider.ContactsContract.CommonDataKinds.Organization;
import android.provider.ContactsContract.CommonDataKinds.Phone;
import android.provider.ContactsContract.CommonDataKinds.Relation;
import android.provider.ContactsContract.CommonDataKinds.StructuredName;
import android.provider.ContactsContract.CommonDataKinds.StructuredPostal;
import android.provider.ContactsContract.CommonDataKinds.Website;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import org.json.JSONArray;
import org.json.JSONObject;

/* V0.43.0: full contact editor API (api level 2).
   list() returns, per contact: id, raw, name, starred, first/middle/last/prefix/suffix, nickname,
   company/department/title, notes, phones[], emails[], addresses[], websites[], events[], relations[],
   plus phone/email (first of each) for older UI code. Rows are {v,t,l}: value, Android type int, custom label.
   save() replaces only the data kinds this editor manages on the contact's primary raw contact; photos, IM,
   groups and data owned by other apps (WhatsApp etc.) are never touched. */
@CapacitorPlugin(name="Contacts", permissions={
 @Permission(alias="contacts", strings={Manifest.permission.READ_CONTACTS, Manifest.permission.WRITE_CONTACTS})
})
public class ContactsPlugin extends Plugin {
 private static final int API=2;
 private static final String[] MIMES={StructuredName.CONTENT_ITEM_TYPE,Nickname.CONTENT_ITEM_TYPE,Phone.CONTENT_ITEM_TYPE,
  Email.CONTENT_ITEM_TYPE,Organization.CONTENT_ITEM_TYPE,Note.CONTENT_ITEM_TYPE,StructuredPostal.CONTENT_ITEM_TYPE,
  Event.CONTENT_ITEM_TYPE,Website.CONTENT_ITEM_TYPE,Relation.CONTENT_ITEM_TYPE};

 private static class Card {
  JSObject o=new JSObject();
  JSArray ph=new JSArray(),em=new JSArray(),ad=new JSArray(),wb=new JSArray(),ev=new JSArray(),rl=new JSArray();
  String company="",dept="",title="",notes="",nick="",first="",last="",prefix="",middle="",suffix="";
  boolean hasOrg=false,hasNote=false,hasNick=false,hasName=false;
 }

 @PluginMethod public void list(PluginCall call) {
  if (getPermissionState("contacts") != com.getcapacitor.PermissionState.GRANTED) {
   requestPermissionForAlias("contacts", call, "contactsPermissionResult"); return;
  }
  listNow(call);
 }
 @PermissionCallback private void contactsPermissionResult(PluginCall call) {
  if (getPermissionState("contacts") == com.getcapacitor.PermissionState.GRANTED) listNow(call);
  else call.reject("Contacts permission was not granted.");
 }

 private static boolean isIm(String accountType) {
  String a=accountType==null?"":accountType;
  return a.startsWith("com.whatsapp")||a.startsWith("org.thoughtcrime")||a.startsWith("org.telegram")
   ||a.startsWith("com.google.android.apps.tachyon")||a.startsWith("com.facebook")||a.startsWith("com.viber");
 }
 private static String s(Cursor c,int i){String v=c.getString(i);return v==null?"":v;}
 private static String marks(int n){StringBuilder b=new StringBuilder();for(int i=0;i<n;i++){if(i>0)b.append(',');b.append('?');}return b.toString();}
 private static String safe(String s){return s==null?"":s;}
 private static String t(JSONObject d,String k){if(d==null||d.isNull(k))return "";return d.optString(k,"").trim();}

 private static JSObject typed(Cursor c) {
  JSObject o=new JSObject();o.put("v",s(c,3));o.put("t",c.getInt(4));o.put("l",s(c,5));return o;
 }

 private void listNow(PluginCall call) {
  ContentResolver cr=getContext().getContentResolver();
  try {
   HashMap<String,Long> prim=new HashMap<>(),anyRaw=new HashMap<>();
   try(Cursor c=cr.query(ContactsContract.RawContacts.CONTENT_URI,
     new String[]{ContactsContract.RawContacts._ID,ContactsContract.RawContacts.CONTACT_ID,ContactsContract.RawContacts.ACCOUNT_TYPE},
     ContactsContract.RawContacts.DELETED+"=0",null,ContactsContract.RawContacts._ID+" ASC")) {
    if(c!=null) while(c.moveToNext()) {
     long rid=c.getLong(0);String cid=c.getString(1);
     if(cid==null)continue;
     if(!anyRaw.containsKey(cid))anyRaw.put(cid,rid);
     if(!prim.containsKey(cid)&&!isIm(c.getString(2)))prim.put(cid,rid);
    }
   }
   LinkedHashMap<String,Card> cards=new LinkedHashMap<>();
   try(Cursor c=cr.query(ContactsContract.Contacts.CONTENT_URI,
     new String[]{ContactsContract.Contacts._ID,ContactsContract.Contacts.DISPLAY_NAME,ContactsContract.Contacts.STARRED},
     null,null,ContactsContract.Contacts.DISPLAY_NAME+" COLLATE NOCASE ASC")) {
    if(c!=null) while(c.moveToNext()) {
     String id=c.getString(0);
     Card k=new Card();
     k.o.put("id",id);
     Long rw=prim.containsKey(id)?prim.get(id):anyRaw.get(id);
     k.o.put("raw",rw==null?"":String.valueOf(rw));
     k.o.put("name",s(c,1));
     k.o.put("starred",c.getInt(2)==1);
     cards.put(id,k);
    }
   }
   String[] proj={ContactsContract.Data.CONTACT_ID,ContactsContract.Data.RAW_CONTACT_ID,ContactsContract.Data.MIMETYPE,
    ContactsContract.Data.DATA1,ContactsContract.Data.DATA2,ContactsContract.Data.DATA3,ContactsContract.Data.DATA4,
    ContactsContract.Data.DATA5,ContactsContract.Data.DATA6,ContactsContract.Data.DATA7,ContactsContract.Data.DATA8,
    ContactsContract.Data.DATA9,ContactsContract.Data.DATA10};
   try(Cursor c=cr.query(ContactsContract.Data.CONTENT_URI,proj,
     ContactsContract.Data.MIMETYPE+" IN ("+marks(MIMES.length)+")",MIMES,
     ContactsContract.Data.IS_PRIMARY+" DESC,"+ContactsContract.Data._ID+" ASC")) {
    if(c!=null) while(c.moveToNext()) {
     String cid=c.getString(0);Card k=cards.get(cid);if(k==null)continue;
     Long want=prim.containsKey(cid)?prim.get(cid):anyRaw.get(cid);
     if(want==null||c.getLong(1)!=want.longValue())continue;
     String mt=s(c,2);
     if(StructuredName.CONTENT_ITEM_TYPE.equals(mt)) {
      if(!k.hasName){k.hasName=true;k.first=s(c,4);k.last=s(c,5);k.prefix=s(c,6);k.middle=s(c,7);k.suffix=s(c,8);}
     } else if(Nickname.CONTENT_ITEM_TYPE.equals(mt)) {
      if(!k.hasNick){k.hasNick=true;k.nick=s(c,3);}
     } else if(Phone.CONTENT_ITEM_TYPE.equals(mt)) {
      if(!s(c,3).isEmpty())k.ph.put(typed(c));
     } else if(Email.CONTENT_ITEM_TYPE.equals(mt)) {
      if(!s(c,3).isEmpty())k.em.put(typed(c));
     } else if(Website.CONTENT_ITEM_TYPE.equals(mt)) {
      if(!s(c,3).isEmpty())k.wb.put(typed(c));
     } else if(Event.CONTENT_ITEM_TYPE.equals(mt)) {
      if(!s(c,3).isEmpty())k.ev.put(typed(c));
     } else if(Relation.CONTENT_ITEM_TYPE.equals(mt)) {
      if(!s(c,3).isEmpty())k.rl.put(typed(c));
     } else if(Organization.CONTENT_ITEM_TYPE.equals(mt)) {
      if(!k.hasOrg){k.hasOrg=true;k.company=s(c,3);k.title=s(c,6);k.dept=s(c,7);}
     } else if(Note.CONTENT_ITEM_TYPE.equals(mt)) {
      if(!k.hasNote){k.hasNote=true;k.notes=s(c,3);}
     } else if(StructuredPostal.CONTENT_ITEM_TYPE.equals(mt)) {
      JSObject a=new JSObject();
      a.put("fmt",s(c,3));a.put("t",c.getInt(4));a.put("l",s(c,5));
      a.put("street",s(c,6));a.put("pobox",s(c,7));a.put("hood",s(c,8));a.put("city",s(c,9));
      a.put("region",s(c,10));a.put("postcode",s(c,11));a.put("country",s(c,12));
      k.ad.put(a);
     }
    }
   }
   JSArray out=new JSArray();
   for(Card k:cards.values()) {
    JSObject o=k.o;
    o.put("first",k.first);o.put("last",k.last);o.put("prefix",k.prefix);o.put("middle",k.middle);o.put("suffix",k.suffix);
    o.put("nickname",k.nick);o.put("company",k.company);o.put("department",k.dept);o.put("title",k.title);o.put("notes",k.notes);
    o.put("phones",k.ph);o.put("emails",k.em);o.put("addresses",k.ad);o.put("websites",k.wb);o.put("events",k.ev);o.put("relations",k.rl);
    JSONObject p0=k.ph.optJSONObject(0),e0=k.em.optJSONObject(0);
    o.put("phone",p0==null?"":p0.optString("v",""));
    o.put("email",e0==null?"":e0.optString("v",""));
    out.put(o);
   }
   JSObject result=new JSObject();result.put("contacts",out);result.put("api",API);call.resolve(result);
  } catch(Exception e){call.reject("Could not read contacts: "+safe(e.getMessage()));}
 }

 @PluginMethod public void save(PluginCall call) {
  if (getPermissionState("contacts") != com.getcapacitor.PermissionState.GRANTED) {
   requestPermissionForAlias("contacts", call, "contactsSavePermissionResult"); return;
  }
  saveNow(call);
 }
 @PermissionCallback private void contactsSavePermissionResult(PluginCall call) {
  if (getPermissionState("contacts") == com.getcapacitor.PermissionState.GRANTED) saveNow(call);
  else call.reject("Contacts permission was not granted.");
 }

 private long findRaw(ContentResolver cr,String contactId,String rawHint) {
  long fallback=-1;
  try(Cursor c=cr.query(ContactsContract.RawContacts.CONTENT_URI,
    new String[]{ContactsContract.RawContacts._ID,ContactsContract.RawContacts.ACCOUNT_TYPE},
    ContactsContract.RawContacts.CONTACT_ID+"=? AND "+ContactsContract.RawContacts.DELETED+"=0",new String[]{contactId},
    ContactsContract.RawContacts._ID+" ASC")) {
   if(c!=null) while(c.moveToNext()) {
    long rid=c.getLong(0);
    if(!rawHint.isEmpty()&&String.valueOf(rid).equals(rawHint))return rid;
    if(fallback<0)fallback=rid;
    if(rawHint.isEmpty()&&!isIm(c.getString(1)))return rid;
   }
  }
  return fallback;
 }

 private static String normDate(String v) { return v.trim(); }

 private void addTyped(ArrayList<ContentProviderOperation> ops,long rawId,String mime,String col,JSONArray arr,int fallback,boolean date) {
  if(arr==null)return;
  for(int i=0;i<arr.length();i++) {
   JSONObject j=arr.optJSONObject(i);if(j==null)continue;
   String v=t(j,"v");if(v.isEmpty())continue;
   if(date)v=normDate(v);
   int type=j.optInt("t",fallback);String label=t(j,"l");
   if(type==0&&label.isEmpty())type=fallback;
   ContentProviderOperation.Builder b=ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
    .withValue(ContactsContract.Data.RAW_CONTACT_ID,rawId).withValue(ContactsContract.Data.MIMETYPE,mime)
    .withValue(col,v).withValue(ContactsContract.Data.DATA2,type);
   if(type==0)b.withValue(ContactsContract.Data.DATA3,label);
   ops.add(b.build());
  }
 }

 private static void part(StringBuilder b,String v,String sep) {
  if(v==null||v.isEmpty())return;
  if(b.length()>0)b.append(sep);
  b.append(v);
 }

 private void addAddresses(ArrayList<ContentProviderOperation> ops,long rawId,JSONArray arr) {
  if(arr==null)return;
  for(int i=0;i<arr.length();i++) {
   JSONObject j=arr.optJSONObject(i);if(j==null)continue;
   String street=t(j,"street"),pobox=t(j,"pobox"),hood=t(j,"hood"),city=t(j,"city"),region=t(j,"region"),post=t(j,"postcode"),country=t(j,"country");
   if((street+pobox+hood+city+region+post+country).isEmpty())continue;
   int type=j.optInt("t",1);String label=t(j,"l");
   if(type==0&&label.isEmpty())type=1;
   StringBuilder f=new StringBuilder();
   part(f,street,"\n");part(f,pobox.isEmpty()?"":"PO Box "+pobox,"\n");part(f,hood,"\n");
   StringBuilder rp=new StringBuilder();part(rp,city,"");part(rp,region,", ");part(rp,post," ");part(f,rp.toString(),"\n");
   part(f,country,"\n");
   ContentProviderOperation.Builder b=ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
    .withValue(ContactsContract.Data.RAW_CONTACT_ID,rawId).withValue(ContactsContract.Data.MIMETYPE,StructuredPostal.CONTENT_ITEM_TYPE)
    .withValue(StructuredPostal.FORMATTED_ADDRESS,f.toString()).withValue(StructuredPostal.TYPE,type);
   if(type==0)b.withValue(StructuredPostal.LABEL,label);
   if(!street.isEmpty())b.withValue(StructuredPostal.STREET,street);
   if(!pobox.isEmpty())b.withValue(StructuredPostal.POBOX,pobox);
   if(!hood.isEmpty())b.withValue(StructuredPostal.NEIGHBORHOOD,hood);
   if(!city.isEmpty())b.withValue(StructuredPostal.CITY,city);
   if(!region.isEmpty())b.withValue(StructuredPostal.REGION,region);
   if(!post.isEmpty())b.withValue(StructuredPostal.POSTCODE,post);
   if(!country.isEmpty())b.withValue(StructuredPostal.COUNTRY,country);
   ops.add(b.build());
  }
 }

 private void saveNow(PluginCall call) {
  JSObject d=call.getData();
  String id=t(d,"id"),rawHint=t(d,"raw");
  String first=t(d,"first"),last=t(d,"last"),prefix=t(d,"prefix"),middle=t(d,"middle"),suffix=t(d,"suffix"),nick=t(d,"nickname");
  String company=t(d,"company"),dept=t(d,"department"),title=t(d,"title"),notes=t(d,"notes");
  if(first.isEmpty()&&last.isEmpty()&&middle.isEmpty()&&prefix.isEmpty()&&suffix.isEmpty())first=t(d,"name");
  if(first.isEmpty()&&last.isEmpty()&&middle.isEmpty()&&nick.isEmpty()&&company.isEmpty()){call.reject("Enter a name or company.");return;}
  ContentResolver cr=getContext().getContentResolver();
  try {
   long rawId=-1;
   if(!id.isEmpty())rawId=findRaw(cr,id,rawHint);
   if(rawId<0) {
    ContentValues rv=new ContentValues();
    rv.put(ContactsContract.RawContacts.ACCOUNT_TYPE,(String)null);
    rv.put(ContactsContract.RawContacts.ACCOUNT_NAME,(String)null);
    Uri u=cr.insert(ContactsContract.RawContacts.CONTENT_URI,rv);
    if(u==null)throw new IllegalStateException("Could not create contact.");
    rawId=ContentUris.parseId(u);
   }
   ArrayList<ContentProviderOperation> ops=new ArrayList<>();
   String[] args=new String[MIMES.length+1];
   args[0]=String.valueOf(rawId);
   System.arraycopy(MIMES,0,args,1,MIMES.length);
   ops.add(ContentProviderOperation.newDelete(ContactsContract.Data.CONTENT_URI)
    .withSelection(ContactsContract.Data.RAW_CONTACT_ID+"=? AND "+ContactsContract.Data.MIMETYPE+" IN ("+marks(MIMES.length)+")",args).build());
   if(!(first.isEmpty()&&last.isEmpty()&&middle.isEmpty()&&prefix.isEmpty()&&suffix.isEmpty())) {
    ContentProviderOperation.Builder b=ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
     .withValue(ContactsContract.Data.RAW_CONTACT_ID,rawId).withValue(ContactsContract.Data.MIMETYPE,StructuredName.CONTENT_ITEM_TYPE);
    if(!first.isEmpty())b.withValue(StructuredName.GIVEN_NAME,first);
    if(!last.isEmpty())b.withValue(StructuredName.FAMILY_NAME,last);
    if(!prefix.isEmpty())b.withValue(StructuredName.PREFIX,prefix);
    if(!middle.isEmpty())b.withValue(StructuredName.MIDDLE_NAME,middle);
    if(!suffix.isEmpty())b.withValue(StructuredName.SUFFIX,suffix);
    ops.add(b.build());
   }
   if(!nick.isEmpty())ops.add(ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
    .withValue(ContactsContract.Data.RAW_CONTACT_ID,rawId).withValue(ContactsContract.Data.MIMETYPE,Nickname.CONTENT_ITEM_TYPE)
    .withValue(Nickname.NAME,nick).withValue(Nickname.TYPE,Nickname.TYPE_DEFAULT).build());
   addTyped(ops,rawId,Phone.CONTENT_ITEM_TYPE,Phone.NUMBER,d.optJSONArray("phones"),Phone.TYPE_MOBILE,false);
   addTyped(ops,rawId,Email.CONTENT_ITEM_TYPE,Email.ADDRESS,d.optJSONArray("emails"),Email.TYPE_HOME,false);
   if(!company.isEmpty()||!dept.isEmpty()||!title.isEmpty()) {
    ContentProviderOperation.Builder b=ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
     .withValue(ContactsContract.Data.RAW_CONTACT_ID,rawId).withValue(ContactsContract.Data.MIMETYPE,Organization.CONTENT_ITEM_TYPE)
     .withValue(Organization.TYPE,Organization.TYPE_WORK);
    if(!company.isEmpty())b.withValue(Organization.COMPANY,company);
    if(!dept.isEmpty())b.withValue(Organization.DEPARTMENT,dept);
    if(!title.isEmpty())b.withValue(Organization.TITLE,title);
    ops.add(b.build());
   }
   addAddresses(ops,rawId,d.optJSONArray("addresses"));
   addTyped(ops,rawId,Website.CONTENT_ITEM_TYPE,Website.URL,d.optJSONArray("websites"),Website.TYPE_HOMEPAGE,false);
   addTyped(ops,rawId,Event.CONTENT_ITEM_TYPE,Event.START_DATE,d.optJSONArray("events"),Event.TYPE_BIRTHDAY,true);
   addTyped(ops,rawId,Relation.CONTENT_ITEM_TYPE,Relation.NAME,d.optJSONArray("relations"),Relation.TYPE_FRIEND,false);
   if(!notes.isEmpty())ops.add(ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
    .withValue(ContactsContract.Data.RAW_CONTACT_ID,rawId).withValue(ContactsContract.Data.MIMETYPE,Note.CONTENT_ITEM_TYPE)
    .withValue(Note.NOTE,notes).build());
   cr.applyBatch(ContactsContract.AUTHORITY,ops);
   if(d.has("starred")) {
    try(Cursor c=cr.query(ContactsContract.RawContacts.CONTENT_URI,new String[]{ContactsContract.RawContacts.CONTACT_ID},
      ContactsContract.RawContacts._ID+"=?",new String[]{String.valueOf(rawId)},null)) {
     if(c!=null&&c.moveToFirst()&&!c.isNull(0)) {
      ContentValues sv=new ContentValues();sv.put(ContactsContract.Contacts.STARRED,d.optBoolean("starred")?1:0);
      cr.update(ContentUris.withAppendedId(ContactsContract.Contacts.CONTENT_URI,c.getLong(0)),sv,null,null);
     }
    } catch(Exception ignored){}
   }
   JSObject result=new JSObject(); result.put("saved",true); call.resolve(result);
  } catch(Exception e){call.reject("Could not save contact: "+safe(e.getMessage()));}
 }

 @PluginMethod public void delete(PluginCall call) {
  if (getPermissionState("contacts") != com.getcapacitor.PermissionState.GRANTED) {
   requestPermissionForAlias("contacts", call, "contactsDeletePermissionResult"); return;
  }
  deleteNow(call);
 }
 @PermissionCallback private void contactsDeletePermissionResult(PluginCall call) {
  if (getPermissionState("contacts") == com.getcapacitor.PermissionState.GRANTED) deleteNow(call);
  else call.reject("Contacts permission was not granted.");
 }
 private void deleteNow(PluginCall call) {
  String id=safe(call.getString("id")).trim();
  if(id.isEmpty()){call.reject("Missing contact ID.");return;}
  try {
   int n=getContext().getContentResolver().delete(ContactsContract.RawContacts.CONTENT_URI,
     ContactsContract.RawContacts.CONTACT_ID+"=?",new String[]{id});
   if(n<=0) throw new IllegalStateException("Contact could not be deleted.");
   JSObject out=new JSObject();out.put("deleted",true);call.resolve(out);
  } catch(Exception e){call.reject("Could not delete contact: "+safe(e.getMessage()));}
 }
}
