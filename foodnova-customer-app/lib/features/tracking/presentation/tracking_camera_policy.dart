class TrackingCameraPolicy {
  bool followingRider = true;
  bool programmaticMove = false;

  void beginProgrammaticMove() {
    programmaticMove = true;
  }

  void cameraMoveStarted() {
    if (!programmaticMove) followingRider = false;
  }

  void cameraIdle() {
    programmaticMove = false;
  }

  void resumeFollowing() {
    followingRider = true;
  }
}
