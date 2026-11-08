#import "update-driver.h"
#include <cmath>

@implementation NomiUpdateDriver
- (instancetype)init {
  if ((self = [super init])) { self.phase = @"idle"; self.nextVersion = @""; self.failure = @""; }
  return self;
}
- (void)resetReplies { self.choice = nil; self.cancellation = nil; self.retryTermination = nil; self.terminationStarted = nil; }
- (BOOL)download {
  if (![self.phase isEqual:@"available"] || !self.choice) return NO;
  void (^reply)(SPUUserUpdateChoice) = self.choice; self.choice = nil;
  self.phase = @"downloading"; self.receivedBytes = 0; self.expectedBytes = 0;
  reply(SPUUserUpdateChoiceInstall); return YES;
}
- (BOOL)install {
  if (![self.phase isEqual:@"ready"] || !self.choice) return NO;
  void (^reply)(SPUUserUpdateChoice) = self.choice; self.choice = nil;
  self.phase = @"installing"; self.failure = @""; self.terminationStarted = [NSDate date];
  reply(SPUUserUpdateChoiceInstall); return YES;
}
- (BOOL)cancel {
  if (!self.cancellation) return NO;
  void (^cancel)(void) = self.cancellation; [self resetReplies]; self.phase = @"idle";
  cancel(); return YES;
}
- (void)resume {
  void (^handler)(void) = self.installHandler; self.installHandler = nil;
  if (handler) handler();
}
- (NSDictionary *)snapshot {
  // Electron may veto quitting when a last-minute document save fails.
  if ([self.phase isEqual:@"installing"] && self.retryTermination && !self.installHandler &&
      self.terminationStarted && -self.terminationStarted.timeIntervalSinceNow > 8) {
    self.phase = @"ready"; self.failure = @"应用尚未退出。请确认文稿已保存后重试。";
    void (^retry)(void) = self.retryTermination;
    self.choice = ^(SPUUserUpdateChoice choice) { if (choice == SPUUserUpdateChoiceInstall) retry(); };
  }
  NSMutableDictionary *result = [@{@"phase": self.phase, @"nextVersion": self.nextVersion,
    @"error": self.failure, @"cancellable": @(self.cancellation != nil),
    @"pendingInstall": @(self.installHandler != nil)} mutableCopy];
  if ([self.phase isEqual:@"downloading"] && self.expectedBytes > 0)
    result[@"progress"] = @(fmin(1., (double)self.receivedBytes / self.expectedBytes));
  else if ([self.phase isEqual:@"extracting"])
    result[@"progress"] = @(fmax(0., fmin(1., self.extractionProgress)));
  return result;
}
- (void)showUpdatePermissionRequest:(SPUUpdatePermissionRequest *)request reply:(void (^)(SUUpdatePermissionResponse *))reply {
  NSAlert *alert = [NSAlert new]; alert.messageText = @"自动检查 Nomi 更新？";
  [alert addButtonWithTitle:@"允许"]; [alert addButtonWithTitle:@"暂不"];
  reply([[SUUpdatePermissionResponse alloc] initWithAutomaticUpdateChecks:[alert runModal] == NSAlertFirstButtonReturn sendSystemProfile:NO]);
}
- (void)showUserInitiatedUpdateCheckWithCancellation:(void (^)(void))cancellation {
  [self resetReplies]; self.failure = @""; self.nextVersion = @"";
  self.phase = @"checking"; self.cancellation = cancellation;
}
- (void)showUpdateFoundWithAppcastItem:(SUAppcastItem *)item state:(SPUUserUpdateState *)state reply:(void (^)(SPUUserUpdateChoice))reply {
  [self resetReplies]; self.failure = @""; self.nextVersion = item.displayVersionString ?: item.versionString;
  if (item.informationOnlyUpdate) {
    self.phase = @"error"; self.failure = @"此版本需从 Nomi GitHub 发布页面手动安装。";
    reply(SPUUserUpdateChoiceDismiss); return;
  }
  self.choice = reply;
  self.phase = state.stage == SPUUserUpdateStageInstalling ? @"ready" : @"available";
}
- (void)showUpdateReleaseNotesWithDownloadData:(SPUDownloadData *)data {}
- (void)showUpdateReleaseNotesFailedToDownloadWithError:(NSError *)error {}
- (void)showUpdateNotFoundWithError:(NSError *)error acknowledgement:(void (^)(void))acknowledgement {
  [self resetReplies];
  NSInteger reason = [error.userInfo[SPUNoUpdateFoundReasonKey] integerValue];
  BOOL latest = reason == SPUNoUpdateFoundReasonOnLatestVersion || reason == SPUNoUpdateFoundReasonOnNewerThanLatestVersion;
  self.phase = latest ? @"up-to-date" : @"error";
  self.failure = latest ? @"" : error.localizedDescription;
  acknowledgement();
}
- (void)showUpdaterError:(NSError *)error acknowledgement:(void (^)(void))acknowledgement {
  [self resetReplies]; self.phase = @"error"; self.failure = error.localizedDescription; acknowledgement();
}
- (void)showDownloadInitiatedWithCancellation:(void (^)(void))cancellation {
  self.phase = @"downloading"; self.receivedBytes = 0; self.expectedBytes = 0; self.cancellation = cancellation;
}
- (void)showDownloadDidReceiveExpectedContentLength:(uint64_t)length { self.expectedBytes = length; }
- (void)showDownloadDidReceiveDataOfLength:(uint64_t)length { self.receivedBytes += length; }
- (void)showDownloadDidStartExtractingUpdate {
  self.cancellation = nil; self.phase = @"extracting"; self.extractionProgress = 0;
}
- (void)showExtractionReceivedProgress:(double)progress { if (std::isfinite(progress)) self.extractionProgress = progress; }
- (void)showReadyToInstallAndRelaunch:(void (^)(SPUUserUpdateChoice))reply {
  self.phase = @"ready"; self.choice = reply; self.cancellation = nil;
}
- (void)showInstallingUpdateWithApplicationTerminated:(BOOL)terminated retryTerminatingApplication:(void (^)(void))retry {
  self.phase = @"installing";
  if (terminated) self.retryTermination = nil; else self.retryTermination = retry; self.terminationStarted = [NSDate date];
}
- (void)showUpdateInstalledAndRelaunched:(BOOL)relaunched acknowledgement:(void (^)(void))acknowledgement { acknowledgement(); }
- (void)dismissUpdateInstallation {
  [self resetReplies]; self.installHandler = nil;
  if (![self.phase isEqual:@"error"] && ![self.phase isEqual:@"up-to-date"]) self.phase = @"idle";
}
- (BOOL)updater:(SPUUpdater *)updater shouldPostponeRelaunchForUpdate:(SUAppcastItem *)item untilInvokingBlock:(void (^)(void))handler {
  self.installHandler = handler; return YES;
}
@end
