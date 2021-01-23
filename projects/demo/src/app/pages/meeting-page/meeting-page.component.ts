import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, Subscription } from 'rxjs';
import { take } from 'rxjs/operators';
import { IMediaTrack, IRemoteUser, NgxAgoraSdkNgService } from 'ngx-agora-sdk-ng';

import { MediaService } from '../../shared/services/media.service';
import { TokenService } from '../../shared/services/token.service';


export interface IMeetingUser {
  type: 'local' | 'remote';
  user?: IRemoteUser;
  mediaTrack?: IMediaTrack;
}

@Component({
  selector: 'app-meeting-page',
  templateUrl: './meeting-page.component.html',
  styleUrls: ['./meeting-page.component.css']
})
export class MeetingPageComponent implements OnInit, OnDestroy {
  @ViewChild('localVideo', { static: true }) localVideo?: ElementRef;
  link = '';
  channel = '';
  subscriptions: Subscription[] = [];
  userList: IMeetingUser[] = [];
  audioInId = '';
  videoInId = '';
  audioOutId = '';
  token = '';
  mediaTrack?: IMediaTrack;
  pinnedUser?: IMeetingUser | null;

  constructor(
    private activatedRoute: ActivatedRoute,
    private agoraService: NgxAgoraSdkNgService,
    private mediaService: MediaService,
    private tokenService: TokenService,
    private router: Router
  ) { }

  ngOnInit(): void {
    forkJoin([
      this.activatedRoute.queryParams.pipe(take(1)),
      this.mediaService.selectedAudioInputId.pipe(take(1)),
      this.mediaService.selectedAudioOutputId.pipe(take(1)),
      this.mediaService.selectedVideoInputId.pipe(take(1)),
    ])
      .pipe(
        take(1),
      ).subscribe(([params, aInId, aOutId, vInId]) => {
        this.link = params.link;
        this.channel = params.channel;
        this.tokenService.getToken(this.channel);
        this.audioInId = aInId;
        this.videoInId = vInId;
        this.audioOutId = aOutId;
      });

    const tokenSub = this.tokenService.token.pipe(take(1)).subscribe(token => {
      this.token = token;
      this.joinVideo();
    });
    this.subscriptions.push(tokenSub);

    const remoteUserJoinSubs = this.agoraService.onRemoteUserJoined().subscribe(user => {
      this.userList.push({ type: 'remote', user });
    });
    this.subscriptions.push(remoteUserJoinSubs);

    const remoteUserLeaveSubs = this.agoraService.onRemoteUserLeft().subscribe(leftuser => {
      this.userList = this.userList.filter(user => user.user?.uid !== leftuser.user.uid);
      if (this.pinnedUser && this.pinnedUser.user?.uid && this.pinnedUser.user.uid === leftuser.user.uid) {
        this.pinnedUser = null;
      } 
    });
    this.subscriptions.push(remoteUserLeaveSubs);

    const remoteUserChangeSubs = this.agoraService.onRemoteUsersStatusChange().subscribe(staus => {  
      const currentUserIndex = this.userList.findIndex(user => user.user?.uid === staus.user.uid);
      if (currentUserIndex >= 0) {
        this.userList[currentUserIndex] = { type: 'remote', user: staus.user };
        if (this.pinnedUser && this.pinnedUser.user?.uid && this.pinnedUser.user.uid === staus.user.uid) {
          this.pinnedUser = { type: 'remote', user: staus.user };
        }
      }
    });
    this.subscriptions.push(remoteUserChangeSubs);

    const localUserJoinedSubs = this.agoraService.onLocalUserJoined().subscribe(track => {
      this.userList.push({ type: 'local', mediaTrack: track.track });
    });
    this.subscriptions.push(localUserJoinedSubs);
  }

  ngOnDestroy(): void {
    for (const sub of this.subscriptions) {
      sub.unsubscribe();
    }
  }

  async joinVideo(): Promise<void> {

    this.mediaTrack = await this.agoraService.join(this.channel, this.token)
      .WithCameraAndMicrophone(this.audioInId, this.videoInId)
      .Apply();
  }

  onLocalMic(value: boolean): void {
    !value ? this.mediaTrack?.microphoneUnMute() : this.mediaTrack?.microphoneMute();
  }

  onLocalCamera(value: boolean): void {
    !value ? this.mediaTrack?.cameraOn() : this.mediaTrack?.cameraOff();
  }

  onLocalLeave(): void {
    this.agoraService.leave();
    this.mediaTrack?.stop();
    this.router.navigate(['/..']);
  }

  getLocalUser(): IMeetingUser {
    return this.userList.filter(user => user.type === 'local')[0];
  }

  onPin(user: IMeetingUser): void {
    if (this.pinnedUser === user) {
      this.pinnedUser = null;
    } else {
      this.pinnedUser = user;
    }
  }

  getUnpinnedUsers() {
    const unpinnedUserList = this.userList.filter(user => user.user?.uid !== this.pinnedUser?.user?.uid);
    return unpinnedUserList;
  }
}
