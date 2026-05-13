import { Router } from 'express'
import type { Services } from '../services'
import { getFormattedName, utcTimestampToUtcDateTime } from '../utils/utils'

export default function routes({ serviceCatalogueService }: Services): Router {
  const router = Router()

  router.get('/', async (req, res) => {
    const scheduledJobRequest = await serviceCatalogueService.getScheduledJob({ name: 'laa-terraform-discovery' })
    return res.render('pages/namespaces', {
      jobName: scheduledJobRequest.name,
      lastSuccessfulRun: utcTimestampToUtcDateTime(scheduledJobRequest.last_successful_run),
    })
  })

  router.get('/data', async (req, res) => {
    const namespaces = await serviceCatalogueService.getNamespaces()

    res.send(namespaces)
  })

  router.get('/:namespaceSlug', async (req, res) => {
    const namespaceSlug = getFormattedName(req, 'namespaceSlug')
    const namespace = await serviceCatalogueService.getNamespace({ namespaceSlug })

    const displayNamespace = {
      name: namespace.name,
      pingdomCheck: namespace.pingdom_check,
      laaTemplate: namespace.laa_template,
      rdsInstances: namespace.rds_instance,
      elasticacheCluster: namespace.elasticache_cluster,
    }

    return res.render('pages/namespace', { namespace: displayNamespace })
  })

  router.get('/:namespaceSlug/rds-instance/:rdsInstance', async (req, res) => {
    const namespaceSlug = getFormattedName(req, 'namespaceSlug')
    const namespace = await serviceCatalogueService.getNamespace({ namespaceSlug })
    const { rdsInstance } = req.params
    const filteredRdsInstance = namespace.rds_instance.find(rds => rds.tf_label === rdsInstance)

    const displayNamespace = {
      name: namespace.name,
      rdsInstance: filteredRdsInstance || null,
    }

    return res.render('pages/rdsInstance', { namespace: displayNamespace })
  })

  router.get('/:namespaceSlug/elasticache-cluster/:elastiCache', async (req, res) => {
    const namespaceSlug = getFormattedName(req, 'namespaceSlug')
    const namespace = await serviceCatalogueService.getNamespace({ namespaceSlug })
    const elasticacheCluster = req.params.elastiCache
    const filteredElasticacheCluster = namespace.elasticache_cluster.find(
      elasticache => elasticache.tf_label === elasticacheCluster,
    )

    const displayNamespace = {
      name: namespace.name,
      elasticacheCluster: filteredElasticacheCluster || null,
    }

    return res.render('pages/elasticacheCluster', { namespace: displayNamespace })
  })

  router.get('/:namespaceSlug/laa-template/:tf_template', async (req, res) => {
    const namespaceSlug = getFormattedName(req, 'namespaceSlug')
    const namespace = await serviceCatalogueService.getNamespace({ namespaceSlug })
    const templateLabel = req.params.tf_template
    const filteredTemplate = namespace.laa_template?.find(template => template.tf_label === templateLabel)

    const displayNamespace = {
      name: namespace.name,
      laaTemplate: filteredTemplate,
    }
    return res.render('pages/laaTemplate', { namespace: displayNamespace })
  })

  router.get('/:namespaceSlug/pingdom-check/:encodedPingdomName', async (req, res) => {
    const namespaceSlug = getFormattedName(req, 'namespaceSlug')
    const namespace = await serviceCatalogueService.getNamespace({ namespaceSlug })
    const { encodedPingdomName } = req.params
    const decodedPingdomName = decodeURIComponent(encodedPingdomName)
    const matchingPingdom = namespace.pingdom_check.find(pingdom => pingdom.name === decodedPingdomName)

    const displayNamespace = {
      name: namespace.name,
      pingdomCheck: matchingPingdom || null,
    }

    return res.render('pages/pingdom', { namespace: displayNamespace })
  })
  return router
}
