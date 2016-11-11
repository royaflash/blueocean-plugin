import { AppPaths, RestPaths } from '../utils/paths';
import utils from '../utils';
import { action } from 'mobx';

export class DefaultSSEHandler {
    constructor(pipelineService, activityService, branchService, pagerService) {
        this.pipelineService = pipelineService;
        this.activityService = activityService;
        this.branchService = branchService;
        this.pagerService = pagerService;
    }

    handleEvents = (event) => {
        console.log('_sseEventHandler', event);
        switch (event.jenkins_event) {
        case 'job_crud_created':
            // Refetch pagers here. This will pull in the newly created pipeline into the bunker.
            this.pipelineService.refresh(this.bunker);
            break;
        case 'job_crud_deleted':
            // Remove directly from bunker. No need to refresh bunkers as it will just show one less item.
            this.pipelineService.removeItem(event.blueocean_job_rest_url);
            break;
        case 'job_crud_renamed':
            // TODO: Implement this.
            // Seems to be that SSE fires an updated event for the old job,
            // then a rename for the new one. This is somewhat confusing for us.
            break;
        case 'job_run_queue_buildable':
        case 'job_run_queue_enter':
            this.queueEnter(event);
            break;
        case 'job_run_queue_left':
           // this.props.processJobLeftQueueEvent(eventCopy);
            break;
        case 'job_run_queue_blocked': {
            break;
        }
        case 'job_run_started': {
            this.updateJob(event);
           // this.props.updateRunState(eventCopy, this.context.config, true);
           // this.props.updateBranchState(eventCopy, this.context.config);
            break;
        }
        case 'job_run_ended': {
            this.updateJob(event);
           // this.props.updateRunState(eventCopy, this.context.config);
           // this.props.updateBranchState(eventCopy, this.context.config);
            break;
        }
        default :
        // Else ignore the event.
        }
    }

    updateJob(event) {
        console.log('updatejob');
        const queueId = event.job_run_queueId;
        const queueSelf = `${event.blueocean_job_rest_url}queue/${queueId}/`;
        const runSelf = `${event.blueocean_job_rest_url}runs/${event.jenkins_object_id}/`;
        
        const key = this.activityService.pagerKey(event.jenkins_org ,event.blueocean_job_pipeline_name);
        const pager = this.pagerService.getPager({ key });
       
        this.activityService.fetchActivity(runSelf).then(d => {
            console.log('blahblah', d);
            if (this.activityService.hasItem(queueSelf)) {
                this.activityService.removeItem(queueSelf);
            }
            
            if (pager && !pager.has(runSelf)) {
                pager.insert(runSelf);
            }
            this.branchService.updateLatestRun(d);
            this.pipelineService.updateLatestRun(d);
        });
    }
    queueCancel(event) {
        if (event.job_run_status === 'CANCELLED') {
            const queueId = event.job_run_queueId;
            const self = `${event.blueocean_job_rest_url}queue/${queueId}/`;
            this.activityService.removeItem(self);
        }
    }
    queueEnter(event) {
        const queueId = event.job_run_queueId;
        const self = `${event.blueocean_job_rest_url}queue/${queueId}/`;
        const id = this.activityService.getExpectedBuildNumber(event);
        console.log('self', id);
        const newRun = {
            id,
            _links: {
                self: {
                    href: self,
                },
                parent: {
                    href: event.blueocean_job_rest_url,
                },
            },
            job_run_queueId: queueId,
            pipeline: event.blueocean_job_branch_name,
            result: 'UNKNOWN',
            state: 'QUEUED',
            _item: {
                _links: {
                    self: {
                        href: self,
                    },
                    parent: {
                        href: event.blueocean_job_rest_url,
                    },
                },
            },
        };

        this.activityService.setItem(newRun);
        console.log('newRun', newRun);
        
        const key = this.activityService.pagerKey(event.jenkins_org ,event.blueocean_job_pipeline_name);
        const pager = this.pagerService.getPager({ key });
        if (pager) {
            pager.insert(self);
        }
    }
}
