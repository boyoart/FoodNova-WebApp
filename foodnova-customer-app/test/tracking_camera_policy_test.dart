import 'package:flutter_test/flutter_test.dart';
import 'package:foodnova_customer_app/features/tracking/presentation/tracking_camera_policy.dart';

void main() {
  test('manual camera movement pauses rider following', () {
    final policy = TrackingCameraPolicy();

    policy.cameraMoveStarted();

    expect(policy.followingRider, isFalse);
  });

  test('programmatic camera movement keeps rider following enabled', () {
    final policy = TrackingCameraPolicy()..beginProgrammaticMove();

    policy.cameraMoveStarted();
    policy.cameraIdle();

    expect(policy.followingRider, isTrue);
    expect(policy.programmaticMove, isFalse);
  });

  test('recenter resumes rider following', () {
    final policy = TrackingCameraPolicy()..cameraMoveStarted();

    policy.resumeFollowing();

    expect(policy.followingRider, isTrue);
  });
}
