#import "update-driver.h"
#include <node_api.h>

static SPUUpdater *updater;
static NomiUpdateDriver *driver;
static NSString *const NomiAutomaticChecksKey = @"NomiAutomaticUpdateChecks";
static napi_value Undefined(napi_env env) { napi_value value; napi_get_undefined(env, &value); return value; }
static napi_value Start(napi_env env, napi_callback_info info) {
  if (![NSThread isMainThread]) { napi_throw_error(env, nullptr, "Sparkle requires the main thread"); return nullptr; }
  if (!updater) {
    driver = [NomiUpdateDriver new];
    updater = [[SPUUpdater alloc] initWithHostBundle:NSBundle.mainBundle applicationBundle:NSBundle.mainBundle userDriver:driver delegate:driver];
    // Preserve the existing preference, but let the host own all scheduling.
    NSUserDefaults *defaults = NSUserDefaults.standardUserDefaults;
    if (![defaults objectForKey:NomiAutomaticChecksKey])
      [defaults setBool:updater.automaticallyChecksForUpdates forKey:NomiAutomaticChecksKey];
    updater.automaticallyChecksForUpdates = NO;
    NSError *error = nil;
    if (![updater startUpdater:&error]) {
      updater = nil; napi_throw_error(env, nullptr, error.localizedDescription.UTF8String); return nullptr;
    }
  }
  return Undefined(env);
}
static napi_value Check(napi_env env, napi_callback_info info) {
  if (!updater.canCheckForUpdates) { napi_throw_error(env, nullptr, "Update check unavailable"); return nullptr; }
  [updater checkForUpdates]; return Undefined(env);
}
static napi_value CheckBackground(napi_env env, napi_callback_info info) {
  if (updater.canCheckForUpdates) [updater checkForUpdatesInBackground];
  return Undefined(env);
}
static napi_value State(napi_env env, napi_callback_info info) {
  NSMutableDictionary *state = [[driver snapshot] mutableCopy];
  state[@"canCheck"] = @(updater.canCheckForUpdates);
  state[@"automatic"] = @([NSUserDefaults.standardUserDefaults boolForKey:NomiAutomaticChecksKey]);
  napi_value result; napi_create_object(env, &result);
  for (NSString *key in state) {
    id field = state[key]; napi_value value;
    if ([field isKindOfClass:NSString.class]) napi_create_string_utf8(env, [field UTF8String], NAPI_AUTO_LENGTH, &value);
    else if (CFGetTypeID((__bridge CFTypeRef)field) == CFBooleanGetTypeID()) napi_get_boolean(env, [field boolValue], &value);
    else napi_create_double(env, [field doubleValue], &value);
    napi_set_named_property(env, result, key.UTF8String, value);
  }
  return result;
}
static napi_value Automatic(napi_env env, napi_callback_info info) {
  size_t count=1; napi_value args[1]; napi_get_cb_info(env,info,&count,args,nullptr,nullptr);
  bool enabled; if(count != 1 || napi_get_value_bool(env,args[0],&enabled)!=napi_ok) { napi_throw_type_error(env,nullptr,"Expected boolean"); return nullptr; }
  [NSUserDefaults.standardUserDefaults setBool:enabled forKey:NomiAutomaticChecksKey]; return Undefined(env);
}
static napi_value Download(napi_env env, napi_callback_info info) {
  if (![driver download]) { napi_throw_error(env, nullptr, "No update available to download"); return nullptr; }
  return Undefined(env);
}
static napi_value Install(napi_env env, napi_callback_info info) {
  if (![driver install]) { napi_throw_error(env, nullptr, "Update is not ready to install"); return nullptr; }
  return Undefined(env);
}
static napi_value Cancel(napi_env env, napi_callback_info info) { [driver cancel]; return Undefined(env); }
static napi_value Resume(napi_env env, napi_callback_info info) { [driver resume]; return Undefined(env); }
static napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
    {"start",0,Start,0,0,0,napi_default,0}, {"check",0,Check,0,0,0,napi_default,0},
    {"checkBackground",0,CheckBackground,0,0,0,napi_default,0},
    {"state",0,State,0,0,0,napi_default,0}, {"resume",0,Resume,0,0,0,napi_default,0},
    {"automatic",0,Automatic,0,0,0,napi_default,0}, {"download",0,Download,0,0,0,napi_default,0},
    {"install",0,Install,0,0,0,napi_default,0}, {"cancel",0,Cancel,0,0,0,napi_default,0},
  };
  napi_define_properties(env,exports,9,properties); return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
